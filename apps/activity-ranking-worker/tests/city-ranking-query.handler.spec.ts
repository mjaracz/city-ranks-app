import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { CityQueryError } from '@libs/contracts/city-query';
import { CITY_RANKING_QUERY } from '@libs/contracts/message-patterns';
import {
  forecastFixture,
  rankingFixture,
} from '../../city-ranking-test.fixtures';
import { CityRankingQueryHandler } from '../src/controllers/city-ranking-query.handler';
import { CityRankingService } from '../src/services/city-ranking.service';

describe('CityRankingQueryHandler', () => {
  let moduleRef: TestingModule;
  let handler: CityRankingQueryHandler;
  const rankings = {
    getRanking: jest.fn<CityRankingService['getRanking']>(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    moduleRef = await Test.createTestingModule({
      controllers: [CityRankingQueryHandler],
      providers: [{ provide: CityRankingService, useValue: rankings }],
    }).compile();
    handler = moduleRef.get(CityRankingQueryHandler);
  });

  afterEach(async () => moduleRef.close());

  it('returns the ranking in the worker response envelope', async () => {
    const ranking = rankingFixture(forecastFixture());
    rankings.getRanking.mockResolvedValue(ranking);

    await expect(handler.getRanking({ city: 'Test Bay' })).resolves.toEqual({
      status: 'OK',
      result: ranking,
    });
    expect(rankings.getRanking).toHaveBeenCalledWith('Test Bay');
  });

  it('returns a typed business error without leaking thrown errors', async () => {
    rankings.getRanking.mockRejectedValue(
      new CityQueryError('CITY_NOT_FOUND', 'Unknown city'),
    );

    await expect(handler.getRanking({ city: 'Missing' })).resolves.toEqual({
      status: 'ERROR',
      code: 'CITY_NOT_FOUND',
      message: 'Unknown city',
    });

    rankings.getRanking.mockRejectedValue(new Error('database detail'));
    await expect(handler.getRanking({ city: 'Test Bay' })).resolves.toEqual({
      status: 'ERROR',
      code: 'RANKING_UNAVAILABLE',
      message: 'City ranking is temporarily unavailable',
    });
  });

  it('exposes the city ranking query pattern through Nest message metadata', () => {
    const patterns = Reflect.getMetadata(
      'microservices:pattern',
      CityRankingQueryHandler.prototype.getRanking,
    );
    expect(patterns).toEqual(expect.arrayContaining([CITY_RANKING_QUERY]));
  });
});
