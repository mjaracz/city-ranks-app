import {
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DomainCommand } from '../../../libs/contracts/src/domain-command';
import { WEATHER_FORECAST_REFRESH_COMMAND } from '../../../libs/contracts/src/message-patterns';
import { JetStreamCommandConsumer } from '../../../libs/messaging/src/jetstream-command-consumer';
import { JetStreamEventStore } from '../../../libs/messaging/src/jetstream-event-store';

interface ForecastRefreshPayload {
  city: string;
}

@Injectable()
export class WeatherCommandHandler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly consumer = new JetStreamCommandConsumer({
    durableName: 'weather-worker-v1',
    subject: WEATHER_FORECAST_REFRESH_COMMAND,
  });

  constructor(private readonly eventStore: JetStreamEventStore) {}

  get isReady(): boolean {
    return this.consumer.isReady;
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.consumer.start<ForecastRefreshPayload>(async (command) => {
      const eventId = `${command.commandId}:forecast-refresh-requested`;
      await this.eventStore.append({
        eventId,
        eventType: 'forecast-refresh-requested',
        schemaVersion: 1,
        occurredAt: new Date().toISOString(),
        correlationId: command.correlationId,
        causationId: command.commandId,
        payload: command.payload,
      });
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.stop();
  }
}

export function createWeatherRefreshCommand(
  city: string,
): DomainCommand<ForecastRefreshPayload> {
  const commandId = randomUUID();
  return {
    commandId,
    commandType: 'weather.forecast.refresh.requested.v1',
    occurredAt: new Date().toISOString(),
    correlationId: commandId,
    payload: { city },
  };
}
