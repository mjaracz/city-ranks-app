import type { DomainCommand } from '@libs/contracts/domain-command';
import type { DomainCommandConsumer } from '@libs/messaging/jetstream-command-consumer';

import { randomUUID } from 'node:crypto';

import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';

import { ACTIVITY_RANKING_REFRESH_COMMAND } from '@libs/contracts/message-patterns';
import { JetStreamEventStore } from '@libs/messaging/jetstream-event-store';

import { ACTIVITY_RANKING_COMMAND_CONSUMER } from '../infrastructure/activity-ranking-command-consumer';
import { CityRankingService } from '../services/city-ranking.service';

interface ActivityRankingRefreshPayload {
  city: string;
}

@Injectable()
export class ActivityRankingCommandHandler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  constructor(
    @Inject(ACTIVITY_RANKING_COMMAND_CONSUMER)
    private readonly consumer: DomainCommandConsumer,
    private readonly eventStore: JetStreamEventStore,
    private readonly rankings: CityRankingService,
  ) {}

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
        // BQ-09: Does a ranking refresh also need to bypass the weather cache TTL?
        await this.rankings.getRanking(command.payload.city, true);
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
