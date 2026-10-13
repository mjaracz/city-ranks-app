import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { getNatsUrl } from '../../../libs/config/src/environment';
import { ACTIVITY_RANKING_WORKER_QUEUE } from '../../../libs/contracts/src/message-patterns';
import { ActivityRankingWorkerModule } from './activity-ranking-worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    ActivityRankingWorkerModule,
    {
      transport: Transport.NATS,
      options: {
        servers: [getNatsUrl()],
        queue: ACTIVITY_RANKING_WORKER_QUEUE,
      },
    },
  );

  await app.listen();
}

bootstrap();
