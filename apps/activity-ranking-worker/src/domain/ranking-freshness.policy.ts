import { Injectable } from '@nestjs/common';

import { CityRanking, localDate } from '@libs/models';

@Injectable()
export class RankingFreshnessPolicy {
  isCurrentWindow(ranking: CityRanking | null, now = new Date()): boolean {
    return (
      !!ranking &&
      ranking.windowStartDate === localDate(now, ranking.city.timezone)
    );
  }
}
