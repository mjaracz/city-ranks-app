import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';

import { WEATHER_WORKER_HEALTH } from '@libs/contracts/message-patterns';
import { WorkerHealth } from '@libs/contracts/worker-health';
import { JetStreamEventStore } from '@libs/messaging/jetstream-event-store';

import { WeatherDatabaseHealth } from '../services/weather-database-health.service';

import { WeatherCommandHandler } from './weather-command.handler';

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
