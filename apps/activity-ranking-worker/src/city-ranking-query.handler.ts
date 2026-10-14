import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import type {
  CityQuery,
  CityQueryResult,
} from '../../../libs/contracts/src/city-query';
import { cityQueryFailure } from '../../../libs/contracts/src/city-query';
import { CITY_RANKING_QUERY } from '../../../libs/contracts/src/message-patterns';
import type { CityRanking } from '../../../libs/models/src';
import { CityRankingService } from './city-ranking.service';

@Controller()
export class CityRankingQueryHandler {
  constructor(private readonly rankings: CityRankingService) {}

  @MessagePattern(CITY_RANKING_QUERY)
  async getRanking(query: CityQuery): Promise<CityQueryResult<CityRanking>> {
    try {
      return {
        status: 'OK',
        result: await this.rankings.getRanking(query?.city),
      };
    } catch (error) {
      return cityQueryFailure(error);
    }
  }
}
