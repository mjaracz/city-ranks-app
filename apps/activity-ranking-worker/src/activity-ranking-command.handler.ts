import {
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DomainCommand } from '../../../libs/contracts/src/domain-command';
import { ACTIVITY_RANKING_REFRESH_COMMAND } from '../../../libs/contracts/src/message-patterns';
import { JetStreamCommandConsumer } from '../../../libs/messaging/src/jetstream-command-consumer';
import { JetStreamEventStore } from '../../../libs/messaging/src/jetstream-event-store';

interface ActivityRankingRefreshPayload {
  city: string;
}

@Injectable()
export class ActivityRankingCommandHandler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly consumer = new JetStreamCommandConsumer({
    durableName: 'activity-ranking-worker-v1',
    subject: ACTIVITY_RANKING_REFRESH_COMMAND,
  });

  constructor(private readonly eventStore: JetStreamEventStore) {}

  get isReady(): boolean {
    return this.consumer.isReady;
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.consumer.start<ActivityRankingRefreshPayload>(
      async (command) => {
        const eventId = `${command.commandId}:activity-ranking-refresh-requested`;
        await this.eventStore.append({
          eventId,
          eventType: 'activity-ranking-refresh-requested',
          schemaVersion: 1,
          occurredAt: new Date().toISOString(),
          correlationId: command.correlationId,
          causationId: command.commandId,
          payload: command.payload,
        });
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.stop();
  }
}

export function createActivityRankingRefreshCommand(
  city: string,
): DomainCommand<ActivityRankingRefreshPayload> {
  const commandId = randomUUID();
  return {
    commandId,
    commandType: 'activity-ranking.ranking.refresh.requested.v1',
    occurredAt: new Date().toISOString(),
    correlationId: commandId,
    payload: { city },
  };
}
