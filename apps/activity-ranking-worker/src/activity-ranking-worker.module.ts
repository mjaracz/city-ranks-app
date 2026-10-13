import { Module } from '@nestjs/common';
import { JetStreamEventStore } from '../../../libs/messaging/src/jetstream-event-store';
import { ActivityRankingCommandHandler } from './activity-ranking-command.handler';
import { ActivityRankingDatabaseHealth } from './activity-ranking-database-health.service';
import { ActivityRankingHealthHandler } from './activity-ranking-health.handler';

@Module({
  controllers: [ActivityRankingHealthHandler],
  providers: [
    ActivityRankingCommandHandler,
    ActivityRankingDatabaseHealth,
    {
      provide: JetStreamEventStore,
      useFactory: () =>
        new JetStreamEventStore({
          streamName: 'ACTIVITY_RANKING_EVENTS',
          subjectPrefix: 'activity-ranking.events',
        }),
    },
  ],
})
export class ActivityRankingWorkerModule {}
