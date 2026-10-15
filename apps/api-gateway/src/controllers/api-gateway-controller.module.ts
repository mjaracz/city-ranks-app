import { DomainCommandFactory } from '../domain/domain-command.factory';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { getNatsUrl, isProduction } from '@libs/config';
import { JetStreamCommandBus } from '@libs/messaging';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  ACTIVITY_RANKING_WORKER_CLIENT,
  WEATHER_WORKER_CLIENT,
} from '@libs/contracts';

import { CityRankingGatewayService } from '../services/city-ranking.service';
import { CityRankingResolver } from './resolvers/city-ranking.resolver';
import { WorkerHealthResolver } from './resolvers/worker-health.resolver';
import { WorkerHealthService } from '../services/worker-health.service';
import { DomainCommandService } from '../services/domain-command.service';
import { DomainCommandResolver } from './resolvers/domain-command.resolver';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      sortSchema: true,
      graphiql: !isProduction(),
    }),
    ClientsModule.register([
      {
        name: WEATHER_WORKER_CLIENT,
        transport: Transport.NATS,
        options: { servers: [getNatsUrl()] },
      },
      {
        name: ACTIVITY_RANKING_WORKER_CLIENT,
        transport: Transport.NATS,
        options: { servers: [getNatsUrl()] },
      },
    ]),
  ],
  providers: [
    CityRankingGatewayService,
    CityRankingResolver,
    WorkerHealthResolver,
    WorkerHealthService,
    JetStreamCommandBus,
    DomainCommandService,
    DomainCommandFactory,
    DomainCommandResolver,
  ],
})
export class ApiGatewayControllerModule {}
