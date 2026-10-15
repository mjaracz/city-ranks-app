import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CommandReceipt,
  DomainCommand,
  ACTIVITY_RANKING_REFRESH_COMMAND,
  WEATHER_FORECAST_REFRESH_COMMAND,
} from '@libs/contracts';
import { DomainCommandSubject } from '@libs/messaging/jetstream-command-bus';
import {
  commandCity,
  commandCoordinates,
} from '../utils/domain-command.validation';

export interface PreparedDomainCommand {
  readonly subject: DomainCommandSubject;
  readonly command: DomainCommand<{
    city: string;
    coordinates?: { latitude: number; longitude: number };
  }>;
  readonly receipt: CommandReceipt;
}

@Injectable()
export class DomainCommandFactory {
  weather(
    city: unknown,
    latitude?: number,
    longitude?: number,
  ): PreparedDomainCommand {
    return this.create(
      'weather',
      WEATHER_FORECAST_REFRESH_COMMAND,
      'weather.forecast.refresh.requested.v1',
      city,
      commandCoordinates(latitude, longitude),
    );
  }

  ranking(city: unknown): PreparedDomainCommand {
    return this.create(
      'activity-ranking',
      ACTIVITY_RANKING_REFRESH_COMMAND,
      'activity-ranking.ranking.refresh.requested.v1',
      city,
    );
  }

  private create(
    domain: string,
    subject: DomainCommandSubject,
    commandType: string,
    city: unknown,
    coordinates?: { latitude: number; longitude: number },
  ): PreparedDomainCommand {
    // BQ-11: Commands currently accept 1-120 city characters; city queries require 2-120. Confirm whether these contracts should converge.
    const normalizedCity = commandCity(city);
    const commandId = randomUUID();
    return {
      subject,
      command: {
        commandId,
        commandType,
        occurredAt: new Date().toISOString(),
        correlationId: commandId,
        payload: coordinates
          ? { city: normalizedCity, coordinates }
          : { city: normalizedCity },
      },
      receipt: { commandId, domain, accepted: true },
    };
  }
}
