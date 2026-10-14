import { jest } from '@jest/globals';
import { CityForecastService } from '../../weather-worker/src/services/city-forecast.service';
import { forecastFixture } from '../../city-ranking-test.fixtures';
import type { INestApplication, INestMicroservice } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import request from 'supertest';
import { ApiGatewayModule } from '../src/api-gateway.module';
import { WeatherWorkerModule } from '../../weather-worker/src/weather-worker.module';
import { ActivityRankingWorkerModule } from '../../activity-ranking-worker/src/activity-ranking-worker.module';
import {
  ACTIVITY_RANKING_WORKER_QUEUE,
  WEATHER_WORKER_QUEUE,
} from '../../../libs/contracts/src/message-patterns';
import { getNatsUrl } from '../../../libs/config/src/environment';
import {
  waitForEvent,
  ensureRankingSchema,
} from '../../worker-integration.helpers';

describe('ApiGateway integration', () => {
  let api: INestApplication;
  let weatherWorker: INestMicroservice;
  let activityRankingWorker: INestMicroservice;

  beforeAll(async () => {
    await ensureRankingSchema();
    weatherWorker = await NestFactory.createMicroservice<MicroserviceOptions>(
      WeatherWorkerModule,
      {
        transport: Transport.NATS,
        options: { servers: [getNatsUrl()], queue: WEATHER_WORKER_QUEUE },
      },
    );
    activityRankingWorker =
      await NestFactory.createMicroservice<MicroserviceOptions>(
        ActivityRankingWorkerModule,
        {
          transport: Transport.NATS,
          options: {
            servers: [getNatsUrl()],
            queue: ACTIVITY_RANKING_WORKER_QUEUE,
          },
        },
      );
    jest
      .spyOn(weatherWorker.get(CityForecastService), 'getForecast')
      .mockResolvedValue(forecastFixture());
    await weatherWorker.listen();
    await activityRankingWorker.listen();
    api = await NestFactory.create(ApiGatewayModule);
    await api.init();
  });

  afterAll(async () => {
    await api?.close();
    await activityRankingWorker?.close();
    await weatherWorker?.close();
  });

  it('reports workers and dispatches both domain commands through GraphQL', async () => {
    const healthResponse = await request(api.getHttpServer())
      .post('/graphql')
      .send({
        query:
          '{ workersHealth { service ready database eventStore commandConsumer } }',
      })
      .expect(200);

    expect(healthResponse.body.errors).toBeUndefined();
    expect(healthResponse.body.data.workersHealth).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ service: 'weather-worker', ready: true }),
        expect.objectContaining({
          service: 'activity-ranking-worker',
          ready: true,
        }),
      ]),
    );

    const weatherResponse = await request(api.getHttpServer())
      .post('/graphql')
      .send({
        query:
          'mutation($city: String!) { requestWeatherRefresh(city: $city) { commandId domain accepted } }',
        variables: { city: 'Reykjavik' },
      })
      .expect(200);
    expect(weatherResponse.body.errors).toBeUndefined();
    const weatherReceipt = weatherResponse.body.data.requestWeatherRefresh;
    expect(weatherReceipt).toMatchObject({ domain: 'weather', accepted: true });

    const rankingResponse = await request(api.getHttpServer())
      .post('/graphql')
      .send({
        query:
          'mutation($city: String!) { requestActivityRanking(city: $city) { commandId domain accepted } }',
        variables: { city: 'Reykjavik' },
      })
      .expect(200);
    expect(rankingResponse.body.errors).toBeUndefined();
    const rankingReceipt = rankingResponse.body.data.requestActivityRanking;
    expect(rankingReceipt).toMatchObject({
      domain: 'activity-ranking',
      accepted: true,
    });

    const [weatherEvent, rankingEvent] = await Promise.all([
      waitForEvent(
        'WEATHER_EVENTS',
        'weather.events.forecast-refresh-requested.v1',
        `${weatherReceipt.commandId}:forecast-refresh-requested`,
      ),
      waitForEvent(
        'ACTIVITY_RANKING_EVENTS',
        'activity-ranking.events.activity-ranking-refresh-requested.v1',
        `${rankingReceipt.commandId}:activity-ranking-refresh-requested`,
      ),
    ]);
    expect(weatherEvent.payload).toEqual({ city: 'Reykjavik' });
    expect(rankingEvent.payload).toEqual({ city: 'Reykjavik' });
  });
});
