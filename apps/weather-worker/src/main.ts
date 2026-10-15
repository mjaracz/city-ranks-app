import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

import { getNatsUrl } from '@libs/config/environment';
import { WEATHER_WORKER_QUEUE } from '@libs/contracts/message-patterns';

import { WeatherWorkerModule } from './weather-worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    WeatherWorkerModule,
    {
      transport: Transport.NATS,
      options: { servers: [getNatsUrl()], queue: WEATHER_WORKER_QUEUE },
    },
  );

  await app.listen();
}

bootstrap();
