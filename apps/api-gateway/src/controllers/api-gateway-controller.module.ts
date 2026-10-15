import { CityRankingGatewayService } from './services/city-ranking.service';
import { CityRankingResolver } from './resolvers/city-ranking.resolver';
import { Module } from '@nestjs/common';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { JetStreamCommandBus } from '../../../../libs/messaging/src/jetstream-command-bus';
import { ApiGatewayController } from './api-gateway.controller';
import { ApiGatewayService } from '../services/api-gateway.service';
import { DomainCommandResolver } from './resolvers/domain-command.resolver';
import { DomainCommandService } from '../services/domain-command.service';
import { WorkerHealthResolver } from './resolvers/worker-health.resolver';
import { WorkerHealthService } from '../services/worker-health.service';
import {
  getNatsUrl,
  isProduction,
} from '../../../../libs/config/src/environment';
import {
  ACTIVITY_RANKING_WORKER_CLIENT,
  WEATHER_WORKER_CLIENT,
} from '../../../../libs/contracts/src/message-patterns';

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
export class ApiGatewayControllerModule {}
