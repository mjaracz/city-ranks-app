import type { INestMicroservice } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import type { ClientProxy, MicroserviceOptions } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { WeatherWorkerModule } from '../src/weather-worker.module';
import { createWeatherRefreshCommand } from '../src/weather-command.handler';
import {
  WEATHER_FORECAST_REFRESH_COMMAND,
  WEATHER_WORKER_HEALTH,
  WEATHER_WORKER_QUEUE,
} from '../../../libs/contracts/src/message-patterns';
import { getNatsUrl } from '../../../libs/config/src/environment';
import { JetStreamCommandBus } from '../../../libs/messaging/src/jetstream-command-bus';
import { waitForEvent } from '../../worker-integration.helpers';

describe('WeatherWorker integration', () => {
  let worker: INestMicroservice;
  let client: ClientProxy;
  let commandBus: JetStreamCommandBus;

  beforeAll(async () => {
    worker = await NestFactory.createMicroservice<MicroserviceOptions>(
      WeatherWorkerModule,
      {
        transport: Transport.NATS,
        options: { servers: [getNatsUrl()], queue: WEATHER_WORKER_QUEUE },
      },
    );
    await worker.listen();
    client = ClientProxyFactory.create({
      transport: Transport.NATS,
      options: { servers: [getNatsUrl()] },
    });
    await client.connect();
    commandBus = new JetStreamCommandBus();
    await commandBus.onModuleInit();
  });

  afterAll(async () => {
    await commandBus?.onModuleDestroy();
    client?.close();
    await worker?.close();
  });

  it('answers health through NATS and persists a refresh event from a durable command', async () => {
    const health = await firstValueFrom(
      client.send(WEATHER_WORKER_HEALTH, {}).pipe(timeout(3000)),
    );
    expect(health).toEqual({
      service: 'weather-worker',
      ready: true,
      database: 'available',
      eventStore: 'available',
      commandConsumer: 'available',
    });

    const command = createWeatherRefreshCommand('Reykjavik');
    await commandBus.publish(WEATHER_FORECAST_REFRESH_COMMAND, command);
    const event = await waitForEvent(
      'WEATHER_EVENTS',
      'weather.events.forecast-refresh-requested.v1',
      `${command.commandId}:forecast-refresh-requested`,
    );

    expect(event.causationId).toBe(command.commandId);
    expect(event.correlationId).toBe(command.correlationId);
    expect(event.payload).toEqual({ city: 'Reykjavik' });
  });
});
