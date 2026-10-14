import { ClientsModule, Transport } from '@nestjs/microservices';
import { getNatsUrl } from '../../../libs/config/src/environment';
import { WEATHER_WORKER_CLIENT } from '../../../libs/contracts/src/message-patterns';
import { CityRankingQueryHandler } from './handlers/city-ranking-query.handler';
import { CityRankingService } from './services/city-ranking.service';
import { Module } from '@nestjs/common';
import { JetStreamEventStore } from '../../../libs/messaging/src/jetstream-event-store';
import { ActivityRankingCommandHandler } from './handlers/activity-ranking-command.handler';
import { ActivityRankingDatabaseHealth } from './services/activity-ranking-database-health.service';
import { ActivityRankingHealthHandler } from './handlers/activity-ranking-health.handler';
import { ActivityRankingPersistenceModule } from './persistence/activity-ranking-persistence.module';
import { ActivityRankingQueryHandler } from './handlers/activity-ranking-query.handler';

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
