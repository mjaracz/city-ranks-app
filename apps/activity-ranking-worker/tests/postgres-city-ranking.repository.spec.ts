import type { Knex } from 'knex';

import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';

import { CityRanking } from '@libs/models';

import {
  forecastFixture,
  rankingFixture,
} from '../../city-ranking-test.fixtures';
import { ACTIVITY_RANKING_KNEX } from '../src/infrastructure/activity-ranking-knex';
import { PostgresCityRankingRepository } from '../src/postgres-city-ranking.repository';

type QueryChain = Record<string, jest.Mock<(...args: any[]) => any>>;

const queryChain = (): QueryChain => {
  const chain: QueryChain = {};
  for (const method of [
    'where',
    'join',
    'select',
    'insert',
    'onConflict',
    'ignore',
    'merge',
    'whereRaw',
  ]) {
    chain[method] = jest.fn().mockReturnValue(chain);
  }
  chain.first = jest
    .fn<(...args: unknown[]) => Promise<unknown>>()
    .mockResolvedValue(null);
  return chain;
};

describe('PostgresCityRankingRepository', () => {
  let moduleRef: TestingModule;
  let repository: PostgresCityRankingRepository;
  let resultQuery: QueryChain;
  let pointerQuery: QueryChain;
  let resultInsert: QueryChain;
  let currentQueryInsert: QueryChain;
  const database = jest.fn<(table: string) => QueryChain>();
  const transaction =
    jest.fn<
      (
        work: (trx: (table: string) => QueryChain) => Promise<void>,
      ) => Promise<void>
    >();

  beforeEach(async () => {
    jest.clearAllMocks();
    resultQuery = queryChain();
    pointerQuery = queryChain();
    resultInsert = queryChain();
    currentQueryInsert = queryChain();
    database.mockImplementation((table: string) =>
      table === 'city_ranking_results' ? resultQuery : pointerQuery,
    );
    const transactionDatabase = jest.fn<(table: string) => QueryChain>(
      (table) =>
        table === 'city_ranking_results' ? resultInsert : currentQueryInsert,
    );
    transaction.mockImplementation(async (work) => work(transactionDatabase));
    Object.assign(database, { transaction });
    moduleRef = await Test.createTestingModule({
      providers: [
        PostgresCityRankingRepository,
        {
          provide: ACTIVITY_RANKING_KNEX,
          useValue: database as unknown as Knex,
        },
      ],
    }).compile();
    repository = moduleRef.get(PostgresCityRankingRepository);
  });

  afterEach(async () => moduleRef.close());

  it('returns a stored ranking by its stable result identifier', async () => {
    const ranking = rankingFixture(forecastFixture());
    resultQuery.first.mockResolvedValue({ payload: ranking });

    await expect(repository.findById(ranking.id)).resolves.toEqual(ranking);
    expect(resultQuery.where).toHaveBeenCalledWith('id', ranking.id);
  });

  it('returns only a matching fresh result for a city and policy version', async () => {
    const ranking = rankingFixture(forecastFixture());
    pointerQuery.first.mockResolvedValue({ payload: ranking });

    await expect(
      repository.findFresh('test bay', ranking.policyVersion),
    ).resolves.toEqual(ranking);
    expect(pointerQuery.where).toHaveBeenCalledWith(
      'query.query_key',
      'test bay',
    );
    expect(pointerQuery.where).toHaveBeenCalledWith(
      'query.policy_version',
      ranking.policyVersion,
    );
    expect(pointerQuery.where).toHaveBeenCalledWith(
      'result.fresh_until',
      '>',
      expect.any(Date),
    );
  });

  it('returns null when there is no stored current ranking', async () => {
    pointerQuery.first.mockResolvedValue(undefined);
    await expect(
      repository.findFresh('test bay', 'weather-suitability-v1'),
    ).resolves.toBeNull();
  });

  it('persists the immutable result and city-policy pointer in one transaction', async () => {
    const ranking = rankingFixture(forecastFixture());

    await repository.save('test bay', ranking);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(resultInsert.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: ranking.id,
        location_id: ranking.city.id,
        payload: JSON.stringify(ranking),
      }),
    );
    expect(currentQueryInsert.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        query_key: 'test bay',
        policy_version: ranking.policyVersion,
        result_id: ranking.id,
      }),
    );
  });

  it('rejects an invalid ranking before writing any records', async () => {
    const invalid = {
      ...rankingFixture(forecastFixture()),
      days: [],
    } as unknown as CityRanking;

    await expect(repository.save('test bay', invalid)).rejects.toThrow(
      'Invalid complete city ranking',
    );
    expect(transaction).not.toHaveBeenCalled();
  });
  it.each(['policyVersion', 'weatherFetchedAt'] as const)(
    'rejects a malformed %s before opening a write transaction',
    async (field) => {
      const ranking = rankingFixture(forecastFixture());
      Object.assign(ranking, { [field]: 123 });

      await expect(repository.save('test bay', ranking)).rejects.toThrow(
        'Invalid complete city ranking',
      );
      expect(transaction).not.toHaveBeenCalled();
      expect(resultInsert.insert).not.toHaveBeenCalled();
      expect(currentQueryInsert.insert).not.toHaveBeenCalled();
    },
  );

  it('rejects numeric strings in nested evaluations before writing records', async () => {
    const ranking = rankingFixture(forecastFixture());
    Object.assign(ranking.days[0].activities[0], { score: '100' });

    await expect(repository.save('test bay', ranking)).rejects.toThrow(
      'Invalid complete city ranking',
    );
    expect(transaction).not.toHaveBeenCalled();
    expect(resultInsert.insert).not.toHaveBeenCalled();
    expect(currentQueryInsert.insert).not.toHaveBeenCalled();
  });
});
