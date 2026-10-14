import { CityRankingGatewayService } from './city-ranking.service';
import { CityRankingResolver } from './city-ranking.resolver';
import { Module } from '@nestjs/common';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { JetStreamCommandBus } from '../../../libs/messaging/src/jetstream-command-bus';
import { ApiGatewayController } from './api-gateway.controller';
import { ApiGatewayService } from './api-gateway.service';
import { DomainCommandResolver } from './domain-command.resolver';
import { DomainCommandService } from './domain-command.service';
import { WorkerHealthResolver } from './worker-health.resolver';
import { WorkerHealthService } from './worker-health.service';
import { getNatsUrl, isProduction } from '../../../libs/config/src/environment';
import {
  ACTIVITY_RANKING_WORKER_CLIENT,
  WEATHER_WORKER_CLIENT,
} from '../../../libs/contracts/src/message-patterns';

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
  controllers: [ApiGatewayController],
  providers: [
    ApiGatewayService,
    CityRankingGatewayService,
    CityRankingResolver,
    WorkerHealthService,
    WorkerHealthResolver,
    JetStreamCommandBus,
    DomainCommandService,
    DomainCommandResolver,
  ],
})
export class ApiGatewayModule {}
