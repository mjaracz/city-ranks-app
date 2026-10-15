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
