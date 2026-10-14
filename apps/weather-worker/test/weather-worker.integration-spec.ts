import type { INestMicroservice } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import type { ClientProxy, MicroserviceOptions } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { randomUUID } from 'node:crypto';
import type { Collection } from 'mongodb';
import { WeatherApiQueryCacheRepository } from '../src/weather-api-query-cache.repository';
import {
  WEATHER_API_CACHE_COLLECTION,
  WeatherApiCacheDocument,
} from '../src/persistence/weather-mongo.providers';
import { createOpenMeteoCurrentRequest } from '../src/data-providers/open-meteo-request';
import { createLoadFixtures } from '../../../scripts/load/load-fixtures';
import { WeatherWorkerModule } from '../src/weather-worker.module';
import { createWeatherRefreshCommand } from '../src/weather-command.handler';
import {
  WEATHER_FORECAST_REFRESH_COMMAND,
  WEATHER_WORKER_HEALTH,
  WEATHER_WORKER_QUEUE,
  WEATHER_CURRENT_QUERY,
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

  it('serves the load-test query through NATS using persisted cache data', async () => {
    const fixture = createLoadFixtures(1, 64, randomUUID())[0];
    const request = createOpenMeteoCurrentRequest(
      process.env.OPEN_METEO_FORECAST_API_URL ||
        'https://api.open-meteo.com/v1/forecast',
      fixture.coordinates,
    );
    const collection = worker.get<Collection<WeatherApiCacheDocument>>(
      WEATHER_API_CACHE_COLLECTION,
    );
    try {
      await worker
        .get(WeatherApiQueryCacheRepository)
        .save(
          request.signature,
          request.query,
          fixture.response,
          new Date(Date.now() + 60_000),
        );
      const weather = await firstValueFrom(
        client
          .send(WEATHER_CURRENT_QUERY, fixture.coordinates)
          .pipe(timeout(3000)),
      );
      expect(weather).toMatchObject({
        temperatureCelsius: 14.5,
        requestedCoordinates: fixture.coordinates,
      });
    } finally {
      await collection.deleteOne({ _id: request.signature });
    }
  });
});
