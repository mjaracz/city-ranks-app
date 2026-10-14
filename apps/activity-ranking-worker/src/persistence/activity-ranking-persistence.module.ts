import { Module } from '@nestjs/common';
import { ActivityRankingRepository } from '../activity-ranking.repository';
import { PostgresActivityRankingRepository } from '../postgres-activity-ranking.repository';
import { ActivityRankingDatabaseModule } from './activity-ranking-database.module';

@Module({
  imports: [ActivityRankingDatabaseModule],
  providers: [
    {
      provide: ActivityRankingRepository,
      useClass: PostgresActivityRankingRepository,
    },
  ],
  exports: [ActivityRankingRepository, ActivityRankingDatabaseModule],
})
export class ActivityRankingPersistenceModule {}
