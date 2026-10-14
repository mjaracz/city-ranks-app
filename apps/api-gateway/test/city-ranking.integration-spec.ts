import type { Collection } from 'mongodb';
import {
  WEATHER_API_CACHE_COLLECTION,
  WeatherApiCacheDocument,
} from '../../weather-worker/src/persistence/weather-mongo.providers';
import { jest } from '@jest/globals';
import type { INestApplication, INestMicroservice } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import request from 'supertest';
import { randomUUID, createHash } from 'node:crypto';
import type { Knex } from 'knex';
import { ApiGatewayModule } from '../src/api-gateway.module';
import { WeatherWorkerModule } from '../../weather-worker/src/weather-worker.module';
import { ActivityRankingWorkerModule } from '../../activity-ranking-worker/src/activity-ranking-worker.module';
import { ACTIVITY_RANKING_KNEX } from '../../activity-ranking-worker/src/persistence/activity-ranking-knex';
import { CityRankingRepository } from '../../activity-ranking-worker/src/city-ranking.repository';
import { getNatsUrl } from '../../../libs/config/src/environment';
import {
  ACTIVITY_RANKING_WORKER_QUEUE,
  WEATHER_WORKER_QUEUE,
} from '../../../libs/contracts/src/message-patterns';
import { CityRanking } from '../../../libs/models/src';
import { upstreamFixture } from '../../city-ranking-test.fixtures';
import {
  ensureRankingSchema,
  waitForEvent,
} from '../../worker-integration.helpers';

const query = `query($city: String!) { cityRanking(city: $city) {
  id city { id name country countryCode region latitude longitude timezone }
  windowStartDate windowEndDate completeness policyVersion forecastSnapshotId
  weatherFetchedAt marineFetchedAt freshUntil computedAt
  days { date completeness activities { activity state score rank reasonCodes explanation } }
} }`;

describe('City ranking GraphQL business flow', () => {
  let api: INestApplication;
  let weather: INestMicroservice;
  let ranking: INestMicroservice;
  let fetchSpy: jest.Spied<typeof fetch>;
  let originalEnvironment: NodeJS.ProcessEnv;
  const prefix = `ranking-integration-${randomUUID()}`;
  const city = `${prefix} bay`;
  let first: CityRanking;

  async function startRankingAndGateway(): Promise<void> {
    ranking = await NestFactory.createMicroservice<MicroserviceOptions>(
      ActivityRankingWorkerModule,
      {
        transport: Transport.NATS,
        options: {
          servers: [getNatsUrl()],
          queue: ACTIVITY_RANKING_WORKER_QUEUE,
        },
        logger: false,
        abortOnError: false,
      },
    );
    await ranking.listen();
    api = await NestFactory.create(ApiGatewayModule, {
      logger: false,
      abortOnError: false,
    });
    await api.init();
  }

  beforeAll(async () => {
    originalEnvironment = process.env;
    process.env = {
      ...process.env,
      OPEN_METEO_API_KEY: '',
      WEATHER_API_CACHE_ONLY: 'false',
      OPEN_METEO_FORECAST_API_URL: `https://ranking-test.invalid/${prefix}/forecast`,
      OPEN_METEO_GEOCODING_API_URL: `https://ranking-test.invalid/${prefix}/geocoding`,
      OPEN_METEO_MARINE_API_URL: `https://ranking-test.invalid/${prefix}/marine`,
    };
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url) => {
        const parsed = new URL(String(url));
        const kind = parsed.pathname.split('/').pop() as
          'geocoding' | 'forecast' | 'marine';
        if (
          kind === 'geocoding' &&
          parsed.searchParams.get('name')?.endsWith('unknown')
        )
          return Response.json({ results: [] });
        return Response.json(upstreamFixture(kind));
      });
    await ensureRankingSchema();
    weather = await NestFactory.createMicroservice<MicroserviceOptions>(
      WeatherWorkerModule,
      {
        transport: Transport.NATS,
        options: { servers: [getNatsUrl()], queue: WEATHER_WORKER_QUEUE },
        logger: false,
        abortOnError: false,
      },
    );
    await weather.listen();
    await startRankingAndGateway();
  }, 30_000);

  beforeEach(() => {
    fetchSpy.mockImplementation(async (url) => {
      const parsed = new URL(String(url));
      const kind = parsed.pathname.split('/').pop() as
        'geocoding' | 'forecast' | 'marine';
      if (
        kind === 'geocoding' &&
        parsed.searchParams.get('name')?.endsWith('unknown')
      )
        return Response.json({ results: [] });
      return Response.json(upstreamFixture(kind));
    });
  });

  afterAll(async () => {
    try {
      if (ranking) {
        const database = ranking.get<Knex>(ACTIVITY_RANKING_KNEX);
        await database('city_ranking_queries')
          .where('query_key', 'like', `${prefix}%`)
          .delete();
      }
    } finally {
      await api?.close();
      await ranking?.close();
      await weather?.close();
      fetchSpy?.mockRestore();
      process.env = originalEnvironment;
    }
  });

  const call = (name = city) =>
    request(api.getHttpServer())
      .post('/graphql')
      .send({ query, variables: { city: name } })
      .expect(200);

  it('calculates seven daily rankings through NATS and stores complete source/result events', async () => {
    const responses = await Promise.all(
      Array.from({ length: 6 }, () => call()),
    );
    for (const response of responses)
      expect(response.body.errors).toBeUndefined();
    first = responses[0].body.data.cityRanking;
    expect(first.city).toMatchObject({
      name: 'Test Bay',
      countryCode: 'PL',
      timezone: 'Europe/Warsaw',
    });
    expect(first.days).toHaveLength(7);
    expect(first.days.flatMap((day) => day.activities)).toHaveLength(28);
    expect(first.days[0].activities.map((item) => item.rank)).toEqual([
      1, 1, 3, 4,
    ]);
    expect(first.completeness).toBe('COMPLETE');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(
      new Set(responses.map((response) => response.body.data.cityRanking.id))
        .size,
    ).toBe(1);
    const event = await waitForEvent<CityRanking>(
      'ACTIVITY_RANKING_EVENTS',
      'activity-ranking.events.city-ranking-computed.v1',
      `${first.id}:city-ranking-computed`,
    );
    expect(event.payload).toEqual(first);
    const source = await waitForEvent(
      'WEATHER_EVENTS',
      'weather.events.forecast-snapshot-accepted.v1',
      `${first.forecastSnapshotId}:forecast-snapshot-accepted`,
    );
    expect(source.payload).toMatchObject({
      snapshotId: first.forecastSnapshotId,
      days: expect.any(Array),
    });
  });

  it('serves normalized repeated queries from persisted rankings without provider calls', async () => {
    const response = await call(`  ${city.toUpperCase()}  `);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.cityRanking).toEqual(first);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('preserves the ranking across new worker and gateway instances', async () => {
    await api.close();
    await ranking.close();
    await startRankingAndGateway();
    const response = await call();
    expect(response.body.errors).toBeUndefined();
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.cityRanking).toEqual(first);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('reuses persisted weather on a ranking cache miss and preserves the immutable run identity', async () => {
    const database = ranking.get<Knex>(ACTIVITY_RANKING_KNEX);
    await database('city_ranking_queries').where('query_key', city).delete();
    const response = await call();
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.cityRanking).toEqual(first);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('serializes a partial result with nullable surfing score and rank after marine failure', async () => {
    const collection = weather.get<Collection<WeatherApiCacheDocument>>(
      WEATHER_API_CACHE_COLLECTION,
    );
    await collection.deleteMany({
      endpoint: `https://ranking-test.invalid/${prefix}/marine`,
    });
    fetchSpy.mockImplementation(async (url) => {
      const kind = new URL(String(url)).pathname.split('/').pop() as
        'geocoding' | 'forecast' | 'marine';
      return kind === 'marine'
        ? new Response('', { status: 503 })
        : Response.json(upstreamFixture(kind));
    });
    const response = await call(`${prefix} partial`);
    expect(response.body.errors).toBeUndefined();
    const result = response.body.data.cityRanking;
    expect(result.completeness).toBe('PARTIAL');
    expect(result.days).toHaveLength(7);
    for (const day of result.days)
      expect(
        day.activities.find((item) => item.activity === 'SURFING'),
      ).toMatchObject({ state: 'INSUFFICIENT_DATA', score: null, rank: null });
    fetchSpy.mockImplementation(async (url) =>
      Response.json(
        upstreamFixture(
          new URL(String(url)).pathname.split('/').pop() as
            'geocoding' | 'forecast' | 'marine',
        ),
      ),
    );
  });

  it('returns typed errors for invalid input, unknown cities and weather failures', async () => {
    expect((await call(' ')).body.errors[0].extensions.code).toBe(
      'INVALID_CITY',
    );
    expect(
      (await call(`${prefix} unknown`)).body.errors[0].extensions.code,
    ).toBe('CITY_NOT_FOUND');
    process.env.OPEN_METEO_API_KEY = '';
    fetchSpy.mockImplementation(async () => new Response('', { status: 503 }));
    expect(
      (await call(`${prefix} failure`)).body.errors[0].extensions.code,
    ).toBe('UPSTREAM_UNAVAILABLE');
    fetchSpy.mockImplementation(async (url) =>
      Response.json(
        upstreamFixture(
          new URL(String(url)).pathname.split('/').pop() as
            'geocoding' | 'forecast' | 'marine',
        ),
      ),
    );
  });

  it('atomically retains immutable history and prevents an older source replacing the latest pointer', async () => {
    const repository = ranking.get(CityRankingRepository);
    const key = `${prefix} ordering`;
    const now = Date.now();
    const newer = {
      ...first,
      id: createHash('sha256').update(`${key}-new`).digest('hex'),
      weatherFetchedAt: new Date(now).toISOString(),
      computedAt: new Date(now).toISOString(),
    };
    const older = {
      ...first,
      id: createHash('sha256').update(`${key}-old`).digest('hex'),
      weatherFetchedAt: new Date(now - 60_000).toISOString(),
      computedAt: new Date(now + 10).toISOString(),
    };
    await repository.save(key, newer);
    await repository.save(key, older);
    expect((await repository.findFresh(key, first.policyVersion)).id).toBe(
      newer.id,
    );
    expect((await repository.findById(older.id)).days).toHaveLength(7);
    await expect(repository.save(key, { ...newer, days: [] })).rejects.toThrow(
      'Invalid complete city ranking',
    );
    expect((await repository.findById(newer.id)).days).toHaveLength(7);
  });
});
