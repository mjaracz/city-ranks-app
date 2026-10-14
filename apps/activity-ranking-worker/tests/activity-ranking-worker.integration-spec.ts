import { jest } from '@jest/globals';
import { CityRankingService } from '../src/city-ranking.service';
import { calculateCityRanking } from '../src/domain/ranking-policy';
import { forecastFixture } from '../../city-ranking-test.fixtures';
import type { INestMicroservice } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import type { ClientProxy, MicroserviceOptions } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { ActivityRankingRepository } from '../src/activity-ranking.repository';
import { ACTIVITY_RANKING_KNEX } from '../src/persistence/activity-ranking-knex';
import { ActivityRankingWorkerModule } from '../src/activity-ranking-worker.module';
import { createActivityRankingRefreshCommand } from '../src/activity-ranking-command.handler';
import {
  ACTIVITY_RANKING_REFRESH_COMMAND,
  ACTIVITY_RANKING_WORKER_HEALTH,
  ACTIVITY_RANKING_WORKER_QUEUE,
  ACTIVITY_RANKINGS_QUERY,
} from '../../../libs/contracts/src/message-patterns';
import { getNatsUrl } from '../../../libs/config/src/environment';
import { JetStreamCommandBus } from '../../../libs/messaging/src/jetstream-command-bus';
import {
  waitForEvent,
  ensureRankingSchema,
} from '../../worker-integration.helpers';

describe('ActivityRankingWorker integration', () => {
  let worker: INestMicroservice;
  let client: ClientProxy;
  let commandBus: JetStreamCommandBus;

  beforeAll(async () => {
    await ensureRankingSchema();
    worker = await NestFactory.createMicroservice<MicroserviceOptions>(
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
      .spyOn(worker.get(CityRankingService), 'getRanking')
      .mockResolvedValue(calculateCityRanking(forecastFixture()));
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

  it('answers health through NATS and persists a ranking event from a durable command', async () => {
    const health = await firstValueFrom(
      client.send(ACTIVITY_RANKING_WORKER_HEALTH, {}).pipe(timeout(3000)),
    );
    expect(health).toEqual({
      service: 'activity-ranking-worker',
      ready: true,
      database: 'available',
      eventStore: 'available',
      commandConsumer: 'available',
    });

    const command = createActivityRankingRefreshCommand('Reykjavik');
    await commandBus.publish(ACTIVITY_RANKING_REFRESH_COMMAND, command);
    const event = await waitForEvent(
      'ACTIVITY_RANKING_EVENTS',
      'activity-ranking.events.activity-ranking-refresh-requested.v1',
      `${command.commandId}:activity-ranking-refresh-requested`,
    );

    expect(event.causationId).toBe(command.commandId);
    expect(event.correlationId).toBe(command.correlationId);
    expect(event.payload).toEqual({ city: 'Reykjavik' });
  });

  it('serves the load-test query through NATS from the ranking repository', async () => {
    const city = `integration-${randomUUID()}`;
    const repository = worker.get(ActivityRankingRepository);
    try {
      await repository.saveRankings([
        {
          city,
          activity: 'skiing',
          forecastDate: '2026-10-14',
          score: 70,
          factors: {},
          calculatedAt: new Date(),
          weatherUpdatedAt: null,
        },
      ]);
      const rankings = await firstValueFrom(
        client
          .send(ACTIVITY_RANKINGS_QUERY, {
            city,
            from: '2026-10-14',
            until: '2026-10-15',
          })
          .pipe(timeout(3000)),
      );
      expect(rankings).toEqual([
        expect.objectContaining({
          city,
          score: 70,
          forecastDate: '2026-10-14',
        }),
      ]);
    } finally {
      await worker
        .get<Knex>(ACTIVITY_RANKING_KNEX)('activity_rankings')
        .where('city', city)
        .delete();
    }
  });
});
