import { Controller } from '@nestjs/common';
import { MessagePattern, RpcException } from '@nestjs/microservices';
import { ACTIVITY_RANKINGS_QUERY } from '@libs/contracts/message-patterns';
import {
  ActivityRankingRepository,
  ActivityRanking,
} from '../activity-ranking.repository';

@Controller()
export class ActivityRankingQueryHandler {
  constructor(private readonly repository: ActivityRankingRepository) {}

  @MessagePattern(ACTIVITY_RANKINGS_QUERY)
  async findRankings(query: {
    city: string;
    from: string;
    until: string;
  }): Promise<ActivityRanking[]> {
    try {
      if (!query || typeof query !== 'object')
        throw new RangeError('Invalid ranking query');
      return await this.repository.findByCityAndPeriod(
        query.city,
        query.from,
        query.until,
      );
    } catch (error) {
      throw new RpcException(
        error instanceof RangeError ? error.message : 'Ranking query failed',
      );
    }
  }
}
