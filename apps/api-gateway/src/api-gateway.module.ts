import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ClientsModule, Transport } from '@nestjs/microservices';

import { getNatsUrl, isProduction } from '@libs/config';
import {
  ACTIVITY_RANKING_WORKER_CLIENT,
  WEATHER_WORKER_CLIENT,
} from '@libs/contracts';
import { JetStreamCommandBus } from '@libs/messaging';

import { CityRankingResolver } from './controllers/resolvers/city-ranking.resolver';
import { DomainCommandResolver } from './controllers/resolvers/domain-command.resolver';
import { WorkerHealthResolver } from './controllers/resolvers/worker-health.resolver';
import { DomainCommandFactory } from './domain/domain-command.factory';
import { CityRankingGatewayService } from './services/city-ranking.service';
import { DomainCommandService } from './services/domain-command.service';
import { WorkerHealthService } from './services/worker-health.service';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      sortSchema: true,
      graphiql: !isProduction() || process.env.GRAPHQL_IDE_ENABLED === 'true',
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
export class ApiGatewayModule {}
