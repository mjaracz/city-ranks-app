import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CommandReceipt,
  DomainCommand,
} from '@libs/contracts/domain-command';
import {
  ACTIVITY_RANKING_REFRESH_COMMAND,
  WEATHER_FORECAST_REFRESH_COMMAND,
} from '@libs/contracts/message-patterns';
import { JetStreamCommandBus } from '@libs/messaging/jetstream-command-bus';

interface WeatherCoordinates {
  latitude: number;
  longitude: number;
}

@Injectable()
export class DomainCommandService {
  constructor(private readonly commandBus: JetStreamCommandBus) {}

  requestWeatherRefresh(
    city: string,
    latitude?: number,
    longitude?: number,
  ): Promise<CommandReceipt> {
    if ((latitude === undefined) !== (longitude === undefined)) {
      throw new BadRequestException(
        'Latitude and longitude must be provided together',
      );
    }

    const coordinates =
      latitude === undefined || longitude === undefined
        ? undefined
        : { latitude, longitude };
    const hasInvalidCoordinates =
      coordinates !== undefined &&
      (!Number.isFinite(coordinates.latitude) ||
        coordinates.latitude < -90 ||
        coordinates.latitude > 90 ||
        !Number.isFinite(coordinates.longitude) ||
        coordinates.longitude < -180 ||
        coordinates.longitude > 180);
    if (hasInvalidCoordinates) {
      throw new BadRequestException('Coordinates are outside valid ranges');
    }

    return this.publish(
      'weather',
      WEATHER_FORECAST_REFRESH_COMMAND,
      'weather.forecast.refresh.requested.v1',
      city,
      coordinates,
    );
  }

  requestActivityRanking(city: string): Promise<CommandReceipt> {
    return this.publish(
      'activity-ranking',
      ACTIVITY_RANKING_REFRESH_COMMAND,
      'activity-ranking.ranking.refresh.requested.v1',
      city,
    );
  }

  private async publish(
    domain: string,
    subject:
      | typeof WEATHER_FORECAST_REFRESH_COMMAND
      | typeof ACTIVITY_RANKING_REFRESH_COMMAND,
    commandType: string,
    city: string,
    coordinates?: WeatherCoordinates,
  ): Promise<CommandReceipt> {
    const normalizedCity = city.trim();
    if (!normalizedCity || normalizedCity.length > 120) {
      throw new BadRequestException('City must contain 1 to 120 characters');
    }

    const commandId = randomUUID();
    const payload: { city: string; coordinates?: WeatherCoordinates } = {
      city: normalizedCity,
    };
    if (coordinates) {
      payload.coordinates = coordinates;
    }
    const command: DomainCommand<typeof payload> = {
      commandId,
      commandType,
      occurredAt: new Date().toISOString(),
      correlationId: commandId,
      payload,
    };

    await this.commandBus.publish(subject, command);
    return { commandId, domain, accepted: true };
  }
}
