import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  ACTIVITY_RANKING_REFRESH_COMMAND,
  CommandReceipt,
  DomainCommand,
} from '@libs/contracts';
import { DomainCommandSubject } from '@libs/messaging/jetstream-command-bus';

import { commandCity } from '../utils/domain-command.validation';

export interface PreparedDomainCommand {
  readonly subject: DomainCommandSubject;
  readonly command: DomainCommand<{ city: string }>;
  readonly receipt: CommandReceipt;
}

@Injectable()
export class DomainCommandFactory {
  ranking(city: unknown): PreparedDomainCommand {
    // BQ-11: Commands currently accept 1-120 city characters; city queries require 2-120. Confirm whether these contracts should converge.
    const normalizedCity = commandCity(city);
    const commandId = randomUUID();
    return {
      subject: ACTIVITY_RANKING_REFRESH_COMMAND,
      command: {
        commandId,
        commandType: 'activity-ranking.ranking.refresh.requested.v1',
        occurredAt: new Date().toISOString(),
        correlationId: commandId,
        payload: { city: normalizedCity },
      },
      receipt: { commandId, domain: 'activity-ranking', accepted: true },
    };
  }
}
