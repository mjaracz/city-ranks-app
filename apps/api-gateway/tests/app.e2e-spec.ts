import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import {
  ACTIVITY_RANKING_WORKER_CLIENT,
  WEATHER_WORKER_CLIENT,
} from '@libs/contracts';
import { JetStreamCommandBus } from '@libs/messaging';

import { CityRankingGatewayService } from '../src/services/city-ranking.service';
import { DomainCommandService } from '../src/services/domain-command.service';
import { WorkerHealthService } from '../src/services/worker-health.service';

describe('ApiGateway GraphQL (e2e)', () => {
  let app: INestApplication;
  const originalEnvironment = {
    NODE_ENV: process.env.NODE_ENV,
    NATS_URL: process.env.NATS_URL,
    GRAPHQL_IDE_ENABLED: process.env.GRAPHQL_IDE_ENABLED,
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'production';
    process.env.NATS_URL ??= 'nats://127.0.0.1:4222';
    process.env.GRAPHQL_IDE_ENABLED = 'true';

    const { ApiGatewayModule } = await import('../src/api-gateway.module');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiGatewayModule],
    })
      .overrideProvider(CityRankingGatewayService)
      .useValue({})
      .overrideProvider(WorkerHealthService)
      .useValue({})
      .overrideProvider(DomainCommandService)
      .useValue({})
      .overrideProvider(JetStreamCommandBus)
      .useValue({})
      .overrideProvider(WEATHER_WORKER_CLIENT)
      .useValue({ close: () => undefined })
      .overrideProvider(ACTIVITY_RANKING_WORKER_CLIENT)
      .useValue({ close: () => undefined })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('serves GraphiQL in production mode when explicitly enabled', async () => {
    const response = await request(app.getHttpServer())
      .get('/graphql')
      .set('Accept', 'text/html')
      .expect(200);

    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('GraphiQL');
  });

  it('serves the GraphQL entry point', async () => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: '{ __typename }' })
      .expect(200);
    expect(response.body.data).toEqual({ __typename: 'Query' });
  });
});
