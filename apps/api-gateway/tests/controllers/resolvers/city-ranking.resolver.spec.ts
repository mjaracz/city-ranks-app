import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import {
  forecastFixture,
  rankingFixture,
} from '../../../../city-ranking-test.fixtures';
import { CityRankingGatewayService } from '../../../src/services/city-ranking.service';
import { CityRankingResolver } from '../../../src/controllers/resolvers/city-ranking.resolver';

describe('CityRankingResolver', () => {
  let moduleRef: TestingModule;
  let resolver: CityRankingResolver;
  const rankings = {
    getRanking: jest.fn<CityRankingGatewayService['getRanking']>(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    moduleRef = await Test.createTestingModule({
      providers: [
        CityRankingResolver,
        { provide: CityRankingGatewayService, useValue: rankings },
      ],
    }).compile();
    resolver = moduleRef.get(CityRankingResolver);
  });

  afterEach(async () => moduleRef.close());

  it('resolves a city ranking by delegating the requested city to the gateway service', async () => {
    const ranking = rankingFixture(forecastFixture());
    rankings.getRanking.mockResolvedValue(ranking);

    await expect(resolver.cityRanking('Test Bay')).resolves.toEqual(ranking);
    expect(rankings.getRanking).toHaveBeenCalledWith('Test Bay');
  });
});
