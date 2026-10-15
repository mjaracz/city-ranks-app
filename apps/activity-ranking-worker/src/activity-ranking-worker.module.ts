import { ACTIVITY_RANKING_COMMAND_CONSUMER } from './infrastructure/activity-ranking-command-consumer';
import { JetStreamCommandConsumer } from '@libs/messaging/jetstream-command-consumer';
import { ACTIVITY_RANKING_REFRESH_COMMAND } from '@libs/contracts/message-patterns';
import { RankingPolicyModule } from './domain/ranking-policy.module';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { getNatsUrl } from '@libs/config/environment';
import { WEATHER_WORKER_CLIENT } from '@libs/contracts/message-patterns';
import { CityRankingQueryHandler } from './controllers/city-ranking-query.handler';
import { CityRankingService } from './services/city-ranking.service';
import { Module } from '@nestjs/common';
import { JetStreamEventStore } from '@libs/messaging/jetstream-event-store';
import { ActivityRankingCommandHandler } from './controllers/activity-ranking-command.handler';
import { ActivityRankingDatabaseHealth } from './services/activity-ranking-database-health.service';
import { ActivityRankingHealthHandler } from './controllers/activity-ranking-health.handler';
import { ActivityRankingPersistenceModule } from './infrastructure/activity-ranking-persistence.module';
import { ActivityRankingQueryHandler } from './controllers/activity-ranking-query.handler';

@Module({
  imports: [
    ActivityRankingPersistenceModule,
    RankingPolicyModule,
    ClientsModule.register([
      {
        name: WEATHER_WORKER_CLIENT,
        transport: Transport.NATS,
        options: { servers: [getNatsUrl()] },
      },
    ]),
  ],
  controllers: [
    ActivityRankingHealthHandler,
    ActivityRankingQueryHandler,
    CityRankingQueryHandler,
  ],
  providers: [
    {
      provide: ACTIVITY_RANKING_COMMAND_CONSUMER,
      useFactory: () =>
        new JetStreamCommandConsumer({
          durableName: 'activity-ranking-worker-v1',
          subject: ACTIVITY_RANKING_REFRESH_COMMAND,
        }),
    },
    ActivityRankingCommandHandler,
    CityRankingService,
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
