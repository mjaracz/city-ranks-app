import { Injectable } from '@nestjs/common';

import { CommandReceipt } from '@libs/contracts';
import { JetStreamCommandBus } from '@libs/messaging';

import {
  DomainCommandFactory,
  PreparedDomainCommand,
} from '../domain/domain-command.factory';

@Injectable()
export class DomainCommandService {
  constructor(
    private readonly commandBus: JetStreamCommandBus,
    private readonly commands: DomainCommandFactory,
  ) {}

  async requestWeatherRefresh(
    city: string,
    latitude?: number,
    longitude?: number,
  ): Promise<CommandReceipt> {
    return this.publish(this.commands.weather(city, latitude, longitude));
  }

  async requestActivityRanking(city: string): Promise<CommandReceipt> {
    return this.publish(this.commands.ranking(city));
  }

  private async publish(
    prepared: PreparedDomainCommand,
  ): Promise<CommandReceipt> {
    await this.commandBus.publish(prepared.subject, prepared.command);
    return prepared.receipt;
  }
}
