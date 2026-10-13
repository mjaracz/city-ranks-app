import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { WEATHER_WORKER_HEALTH } from '../../../libs/contracts/src/message-patterns';
import { WorkerHealth } from '../../../libs/contracts/src/worker-health';
import { JetStreamEventStore } from '../../../libs/messaging/src/jetstream-event-store';
import { WeatherCommandHandler } from './weather-command.handler';
import { WeatherDatabaseHealth } from './weather-database-health.service';

@Controller()
export class WeatherHealthHandler {
  constructor(
    private readonly databaseHealth: WeatherDatabaseHealth,
    private readonly eventStore: JetStreamEventStore,
    private readonly commandHandler: WeatherCommandHandler,
  ) {}

  @MessagePattern(WEATHER_WORKER_HEALTH)
  async getHealth(): Promise<WorkerHealth> {
    const databaseAvailable = await this.databaseHealth.isAvailable();
    const eventStoreAvailable = this.eventStore.isReady;
    const commandConsumerAvailable = this.commandHandler.isReady;

    return {
      service: 'weather-worker',
      ready:
        databaseAvailable && eventStoreAvailable && commandConsumerAvailable,
      database: databaseAvailable ? 'available' : 'unavailable',
      eventStore: eventStoreAvailable ? 'available' : 'unavailable',
      commandConsumer: commandConsumerAvailable ? 'available' : 'unavailable',
    };
  }
}
