import { Args, Query, Resolver } from '@nestjs/graphql';
import { CityRankingGatewayService } from '../services/city-ranking.service';
import { CityRankingType } from '../types/city-ranking.type';

@Resolver(() => CityRankingType)
export class CityRankingResolver {
  constructor(private readonly rankings: CityRankingGatewayService) {}

  @Query(() => CityRankingType)
  cityRanking(
    @Args('city', { type: () => String }) city: string,
  ): Promise<CityRankingType> {
    return this.rankings.getRanking(city);
  }
}
