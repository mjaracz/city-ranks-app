import type { INestApplication } from '@nestjs/common';

import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { GraphQLError } from 'graphql';
import request from 'supertest';

import {
  ACTIVITY_RANKING_WORKER_CLIENT,
  WEATHER_WORKER_CLIENT,
} from '@libs/contracts/message-patterns';
import { JetStreamCommandBus } from '@libs/messaging/jetstream-command-bus';

import {
  forecastFixture,
  rankingFixture,
} from '../../../city-ranking-test.fixtures';
import { ApiGatewayModule } from '../../src/api-gateway.module';
import { CityRankingGatewayService } from '../../src/services/city-ranking.service';
import { DomainCommandService } from '../../src/services/domain-command.service';
import { WorkerHealthService } from '../../src/services/worker-health.service';

describe('ApiGateway controller module', () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  const ranking = rankingFixture(forecastFixture());
  const rankings = {
    getRanking: jest.fn<CityRankingGatewayService['getRanking']>(),
  };
  const health = {
    getWorkersHealth: jest.fn<WorkerHealthService['getWorkersHealth']>(),
  };
  const commands = {
    requestActivityRanking:
      jest.fn<DomainCommandService['requestActivityRanking']>(),
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [ApiGatewayModule] })
      .overrideProvider(CityRankingGatewayService)
      .useValue(rankings)
      .overrideProvider(WorkerHealthService)
      .useValue(health)
      .overrideProvider(DomainCommandService)
      .useValue(commands)
      .overrideProvider(JetStreamCommandBus)
      .useValue({})
      .overrideProvider(WEATHER_WORKER_CLIENT)
      .useValue({ close: jest.fn() })
      .overrideProvider(ACTIVITY_RANKING_WORKER_CLIENT)
      .useValue({ close: jest.fn() })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => app?.close());

  it('exposes the city ranking query and nested GraphQL types', async () => {
    rankings.getRanking.mockResolvedValue(ranking);
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query:
          'query($city: String!) { cityRanking(city: $city) { id city { name } days { date activities { activity score rank } } } }',
        variables: { city: 'Test Bay' },
      })
      .expect(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.cityRanking).toMatchObject({
      id: ranking.id,
      city: { name: ranking.city.name },
    });
    expect(response.body.data.cityRanking.days).toHaveLength(7);
    expect(rankings.getRanking).toHaveBeenCalledWith('Test Bay');
  });

  it('preserves worker health and the activity ranking mutation', async () => {
    health.getWorkersHealth.mockResolvedValue([
      {
        service: 'weather-worker',
        ready: true,
        database: 'available',
        eventStore: 'available',
        commandConsumer: 'available',
      },
    ]);
    commands.requestActivityRanking.mockResolvedValue({
      commandId: 'ranking-command',
      domain: 'activity-ranking',
      accepted: true,
    });
    const workerResponse = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: '{ workersHealth { service ready } }' })
      .expect(200);
    expect(workerResponse.body.errors).toBeUndefined();
    expect(workerResponse.body.data.workersHealth).toEqual([
      { service: 'weather-worker', ready: true },
    ]);
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({
        query:
          'mutation { requestActivityRanking(city: "Porto") { commandId accepted } }',
      })
      .expect(200);
    expect(response.body.errors).toBeUndefined();
    expect(response.body.data).toEqual({
      requestActivityRanking: { commandId: 'ranking-command', accepted: true },
    });
    expect(commands.requestActivityRanking).toHaveBeenCalledWith('Porto');
  });

  it('exposes only the activity ranking mutation in the public schema', async () => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: '{ __schema { mutationType { fields { name } } } }' })
      .expect(200);

    expect(response.body.errors).toBeUndefined();
    expect(response.body.data.__schema.mutationType.fields).toEqual([
      { name: 'requestActivityRanking' },
    ]);
  });

  it.each(['city: "Porto"', 'city: "Porto", latitude: 41.1, longitude: -8.6'])(
    'rejects the removed weather mutation with %s',
    async (arguments_) => {
      const response = await request(app.getHttpServer())
        .post('/graphql')
        .send({
          query: `mutation { requestWeatherRefresh(${arguments_}) { commandId accepted } }`,
        })
        .expect(400);

      expect(response.body.data).toBeUndefined();
      expect(response.body.errors[0]).toMatchObject({
        extensions: { code: 'GRAPHQL_VALIDATION_FAILED' },
      });
      expect(commands.requestActivityRanking).not.toHaveBeenCalled();
    },
  );

  it('preserves GraphQL domain error codes', async () => {
    rankings.getRanking.mockRejectedValue(
      new GraphQLError('Unknown city', {
        extensions: { code: 'CITY_NOT_FOUND' },
      }),
    );
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: '{ cityRanking(city: "Missing") { id } }' })
      .expect(200);
    expect(response.body.errors[0]).toMatchObject({
      message: 'Unknown city',
      extensions: { code: 'CITY_NOT_FOUND' },
    });
  });

  it('exposes the GraphQL entry point', async () => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: '{ __typename }' })
      .expect(200);
    expect(response.body.data).toEqual({ __typename: 'Query' });
  });
});
