import type { INestMicroservice } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import type { ClientProxy, MicroserviceOptions } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { ActivityRankingWorkerModule } from '../src/activity-ranking-worker.module';
import { createActivityRankingRefreshCommand } from '../src/activity-ranking-command.handler';
import {
  ACTIVITY_RANKING_REFRESH_COMMAND,
  ACTIVITY_RANKING_WORKER_HEALTH,
  ACTIVITY_RANKING_WORKER_QUEUE,
} from '../../../libs/contracts/src/message-patterns';
import { getNatsUrl } from '../../../libs/config/src/environment';
import { JetStreamCommandBus } from '../../../libs/messaging/src/jetstream-command-bus';
import { waitForEvent } from '../../worker-integration.helpers';

describe('ActivityRankingWorker integration', () => {
  let worker: INestMicroservice;
  let client: ClientProxy;
  let commandBus: JetStreamCommandBus;

  beforeAll(async () => {
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
});
