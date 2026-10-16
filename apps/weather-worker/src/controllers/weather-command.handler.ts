import type { DomainCommand } from '@libs/contracts/domain-command';
import type { DomainCommandConsumer } from '@libs/messaging/jetstream-command-consumer';

import type { WeatherCoordinates } from '../data-providers/open-meteo.types';

import { randomUUID } from 'node:crypto';

import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';

import { JetStreamEventStore } from '@libs/messaging/jetstream-event-store';

import { OpenMeteoProvider } from '../data-providers/open-meteo.provider';
import { WEATHER_COMMAND_CONSUMER } from '../infrastructure/weather-command-consumer';

interface ForecastRefreshPayload {
  city: string;
  coordinates?: WeatherCoordinates;
}

@Injectable()
export class WeatherCommandHandler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  constructor(
    @Inject(WEATHER_COMMAND_CONSUMER)
    private readonly consumer: DomainCommandConsumer,
    private readonly eventStore: JetStreamEventStore,
    private readonly openMeteoProvider: OpenMeteoProvider,
  ) {}

  get isReady(): boolean {
    return this.consumer.isReady;
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.consumer.start<ForecastRefreshPayload>(async (command) => {
      const currentWeather = command.payload.coordinates
        ? await this.openMeteoProvider.getCurrentWeather(
            command.payload.coordinates,
          )
        : undefined;
      const eventType = currentWeather
        ? 'current-weather-fetched'
        : 'forecast-refresh-requested';
      const eventId = `${command.commandId}:${eventType}`;
      await this.eventStore.append({
        eventId,
        eventType,
        schemaVersion: 1,
        occurredAt: new Date().toISOString(),
        correlationId: command.correlationId,
        causationId: command.commandId,
        payload: currentWeather
          ? { ...command.payload, currentWeather }
          : command.payload,
      });
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.stop();
  }
}

export function createWeatherRefreshCommand(
  city: string,
  coordinates?: WeatherCoordinates,
): DomainCommand<ForecastRefreshPayload> {
  const commandId = randomUUID();
  return {
    commandId,
    commandType: 'weather.forecast.refresh.requested.v1',
    occurredAt: new Date().toISOString(),
    correlationId: commandId,
    payload: coordinates ? { city, coordinates } : { city },
  };
}
