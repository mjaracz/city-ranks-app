import knex from 'knex';
import { Test } from '@nestjs/testing';
import { PostgresActivityRankingRepository } from './postgres-activity-ranking.repository';
import {
  ActivityRankingRepository,
  ActivityRanking,
} from './activity-ranking.repository';
import { ActivityRankingPersistenceModule } from './persistence/activity-ranking-persistence.module';
import { ACTIVITY_RANKING_KNEX } from './persistence/activity-ranking-knex';
import { up } from './persistence/migrations/001-create-activity-rankings';

describe('Knex ActivityRanking repository', () => {
  const database = knex({ client: 'pg', compileSqlOnError: false });
  const queries: Array<{ sql: string; bindings: unknown[] }> = [];
  let failInsert = false;
  const maliciousCity = "Warsaw'); DROP TABLE activity_rankings; --";
  const ranking: ActivityRanking = {
    city: maliciousCity,
    activity: 'skiing',
    forecastDate: '2026-10-14',
    score: 80,
    factors: { condition: "'); DROP TABLE activity_rankings; --" },
    calculatedAt: new Date(),
    weatherUpdatedAt: null,
  };
  const repository = new PostgresActivityRankingRepository(database);

  beforeAll(() => {
    const client = database.client as unknown as {
      acquireConnection: () => Promise<object>;
      releaseConnection: () => Promise<void>;
    };
    client.acquireConnection = async () => ({
      query(
        query: { text: string; values?: unknown[] },
        callback: (error: Error | null, result?: unknown) => void,
      ) {
        queries.push({ sql: query.text, bindings: query.values ?? [] });
        if (failInsert && query.text.startsWith('insert')) {
          callback(new Error('Simulated persistence failure'));
          return;
        }
        callback(null, {
          rows: query.text.startsWith('select')
            ? [
                {
                  city: maliciousCity,
                  activity: 'skiing',
                  forecast_date: '2026-10-14',
                  score: '80.00',
                  factors: ranking.factors,
                  calculated_at: ranking.calculatedAt,
                  weather_updated_at: null,
                },
              ]
            : [],
          rowCount: 1,
          command: query.text.split(' ')[0].replace(';', '').toUpperCase(),
        });
      },
    });
    client.releaseConnection = async () => undefined;
  });
  beforeEach(() => {
    queries.length = 0;
    failInsert = false;
  });
  afterAll(async () => database.destroy());

  it('binds malicious SQL input as data for writes and reads', async () => {
    await repository.saveRankings([ranking]);
    const rows = await repository.findByCityAndPeriod(
      maliciousCity,
      '2026-10-14',
      '2026-10-15',
    );
    const insert = queries.find((query) => query.sql.startsWith('insert'));
    const select = queries.find((query) => query.sql.startsWith('select'));
    expect(insert.sql).not.toContain(maliciousCity);
    expect(select.sql).not.toContain(maliciousCity);
    expect(insert.bindings).toContain(maliciousCity);
    expect(select.bindings).toEqual([
      maliciousCity,
      '2026-10-14',
      '2026-10-15',
    ]);
    expect(insert.sql).toContain('on conflict');
    expect(rows[0].forecastDate).toBe('2026-10-14');
    expect(rows[0].score).toBe(80);
  });

  it('rolls back and rejects failed transactions', async () => {
    failInsert = true;
    await expect(repository.saveRankings([ranking])).rejects.toThrow(
      'Simulated',
    );
    expect(queries.some((query) => query.sql.startsWith('ROLLBACK'))).toBe(
      true,
    );
    expect(queries.some((query) => query.sql.startsWith('COMMIT'))).toBe(false);
  });

  it('deduplicates a batch by its domain key, preserving the last value', async () => {
    await repository.saveRankings([ranking, { ...ranking, score: 90 }]);
    const insert = queries.find((query) => query.sql.startsWith('insert'));
    expect(
      insert.bindings.filter((value) => value === maliciousCity),
    ).toHaveLength(1);
    expect(insert.bindings).toContain(90);
  });

  it('rejects invalid query types and dates before invoking the database', async () => {
    await expect(
      repository.findByCityAndPeriod(
        { $ne: null } as unknown as string,
        '2026-10-14',
        '2026-10-15',
      ),
    ).rejects.toThrow();
    await expect(
      repository.findByCityAndPeriod('Warsaw', '2026-02-30', '2026-03-02'),
    ).rejects.toThrow();
    await expect(
      repository.findByCityAndPeriod(
        'Warsaw',
        "2026-10-14'; DROP TABLE x; --",
        '2026-10-15',
      ),
    ).rejects.toThrow();
    expect(queries).toHaveLength(0);
  });

  it('builds constraints in a versioned migration', async () => {
    await up(database);
    expect(
      queries.some((query) =>
        query.sql.includes('create table "activity_rankings"'),
      ),
    ).toBe(true);
    expect(queries.some((query) => query.sql.includes('check'))).toBe(true);
  });

  it('resolves the domain port through a replaceable Knex token', async () => {
    const module = await Test.createTestingModule({
      imports: [ActivityRankingPersistenceModule],
    })
      .overrideProvider(ACTIVITY_RANKING_KNEX)
      .useValue(database)
      .compile();
    expect(module.get(ActivityRankingRepository)).toBeInstanceOf(
      PostgresActivityRankingRepository,
    );
    await module.close();
  });
});
