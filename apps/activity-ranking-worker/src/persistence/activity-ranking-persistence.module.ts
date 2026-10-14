import { CityRankingRepository } from '../city-ranking.repository';
import { PostgresCityRankingRepository } from '../postgres-city-ranking.repository';
import { Module } from '@nestjs/common';
import { ActivityRankingRepository } from '../activity-ranking.repository';
import { PostgresActivityRankingRepository } from '../postgres-activity-ranking.repository';
import { ActivityRankingDatabaseModule } from './activity-ranking-database.module';

@Module({
  imports: [ActivityRankingDatabaseModule],
  providers: [
    { provide: CityRankingRepository, useClass: PostgresCityRankingRepository },
    {
      provide: ActivityRankingRepository,
      useClass: PostgresActivityRankingRepository,
    },
  ],
  exports: [
    CityRankingRepository,
    ActivityRankingRepository,
    ActivityRankingDatabaseModule,
  ],
})
export class ActivityRankingPersistenceModule {}
