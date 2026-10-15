import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Knex } from 'knex';
import type { Collection } from 'mongodb';
import { randomUUID, createHash } from 'node:crypto';
import { ActivityRankingPersistenceModule } from '../activity-ranking-worker/src/infrastructure/activity-ranking-persistence.module';
import { ACTIVITY_RANKING_KNEX } from '../activity-ranking-worker/src/infrastructure/activity-ranking-knex';
import { ActivityRankingRepository } from '../activity-ranking-worker/src/activity-ranking.repository';
import { WeatherPersistenceModule } from '../weather-worker/src/infrastructure/weather-persistence.module';
import { WeatherApiQueryCacheRepository } from '../weather-worker/src/weather-api-query-cache.repository';
import {
  WEATHER_API_CACHE_COLLECTION,
  WeatherApiCacheDocument,
} from '../weather-worker/src/infrastructure/weather-mongo.providers';
import { ensureRankingSchema } from '../worker-integration.helpers';

describe('Real persistence adapters', () => {
  let weather: INestApplicationContext;
  let ranking: INestApplicationContext;
  const city = `test-${randomUUID()}'); DROP TABLE activity_rankings; --`;
  const signature = createHash('sha256').update(city).digest('hex');
  beforeAll(async () => {
    await ensureRankingSchema();
    ranking = await NestFactory.createApplicationContext(
      ActivityRankingPersistenceModule,
      { logger: false, abortOnError: false },
    );
    weather = await NestFactory.createApplicationContext(
      WeatherPersistenceModule,
      { logger: false, abortOnError: false },
    );
  }, 30_000);
  afterAll(async () => {
    try {
      await weather
        ?.get<Collection<WeatherApiCacheDocument>>(WEATHER_API_CACHE_COLLECTION)
        .deleteOne({ _id: signature });
      await ranking
        ?.get<Knex>(ACTIVITY_RANKING_KNEX)('activity_rankings')
        .where('city', city)
        .delete();
    } finally {
      await Promise.allSettled([weather?.close(), ranking?.close()]);
    }
  });

  it('preserves SQL-looking input literally, leaves the table intact and upserts one row', async () => {
    const repository = ranking.get(ActivityRankingRepository);
    const record = {
      city,
      activity: 'skiing' as const,
      forecastDate: '2026-10-14',
      score: 60,
      factors: { raw: "'; DELETE FROM activity_rankings; --" },
      calculatedAt: new Date(),
      weatherUpdatedAt: null,
    };
    await repository.saveRankings([record]);
    await repository.saveRankings([{ ...record, score: 75 }]);
    const rows = await repository.findByCityAndPeriod(
      city,
      '2026-10-14',
      '2026-10-15',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      city,
      score: 75,
      forecastDate: '2026-10-14',
      factors: record.factors,
    });
    expect(
      await ranking
        .get<Knex>(ACTIVITY_RANKING_KNEX)
        .schema.hasTable('activity_rankings'),
    ).toBe(true);
    expect(
      await repository.findByCityAndPeriod(
        "' OR 1=1 --",
        '2026-10-14',
        '2026-10-15',
      ),
    ).toHaveLength(0);
  });

  it('persists a Mongo cache entry across connections and excludes an expired document', async () => {
    const query = { endpoint: 'https://example.invalid', parameters: { city } };
    await weather
      .get(WeatherApiQueryCacheRepository)
      .save(signature, query, { value: 1 }, new Date(Date.now() + 60_000));
    await weather.close();
    weather = await NestFactory.createApplicationContext(
      WeatherPersistenceModule,
      { logger: false, abortOnError: false },
    );
    const repository = weather.get(WeatherApiQueryCacheRepository);
    expect(await repository.findFresh(signature)).toMatchObject({
      response: { value: 1 },
    });
    const collection = weather.get<Collection<WeatherApiCacheDocument>>(
      WEATHER_API_CACHE_COLLECTION,
    );
    const index = (await collection.listIndexes().toArray()).find(
      (item) => item.name === 'cache_expiry_ttl',
    );
    expect(index.expireAfterSeconds).toBe(0);
    await collection.updateOne(
      { _id: signature },
      { $set: { expiresAt: new Date(0) } },
    );
    expect(await repository.findFresh(signature)).toBeNull();
  });
});
