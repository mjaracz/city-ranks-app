import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { ACTIVITY_RANKING_WORKER_HEALTH } from '../../../../libs/contracts/src/message-patterns';
import { WorkerHealth } from '../../../../libs/contracts/src/worker-health';
import { JetStreamEventStore } from '../../../../libs/messaging/src/jetstream-event-store';
import { ActivityRankingCommandHandler } from './activity-ranking-command.handler';
import { ActivityRankingDatabaseHealth } from '../services/activity-ranking-database-health.service';

@Controller()
export class ActivityRankingHealthHandler {
  constructor(
    private readonly databaseHealth: ActivityRankingDatabaseHealth,
    private readonly eventStore: JetStreamEventStore,
    private readonly commandHandler: ActivityRankingCommandHandler,
  ) {}

  @MessagePattern(ACTIVITY_RANKING_WORKER_HEALTH)
  async getHealth(): Promise<WorkerHealth> {
    const databaseAvailable = await this.databaseHealth.isAvailable();
    const eventStoreAvailable = this.eventStore.isReady;
    const commandConsumerAvailable = this.commandHandler.isReady;

    return {
      service: 'activity-ranking-worker',
      ready:
        databaseAvailable && eventStoreAvailable && commandConsumerAvailable,
      database: databaseAvailable ? 'available' : 'unavailable',
      eventStore: eventStoreAvailable ? 'available' : 'unavailable',
      commandConsumer: commandConsumerAvailable ? 'available' : 'unavailable',
    };
  }
}
