import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  jetstream,
  jetstreamManager,
  RetentionPolicy,
  StorageType,
} from '@nats-io/jetstream';
import type { JetStreamClient, JetStreamManager } from '@nats-io/jetstream';
import { connect } from '@nats-io/transport-node';
import type { DomainCommand } from '../../contracts/src/domain-command';
import {
  ACTIVITY_RANKING_REFRESH_COMMAND,
  DOMAIN_COMMANDS_STREAM,
  WEATHER_FORECAST_REFRESH_COMMAND,
} from '../../contracts/src/message-patterns';
import { getNatsUrl } from '../../config/src/environment';

export type DomainCommandSubject =
  | typeof WEATHER_FORECAST_REFRESH_COMMAND
  | typeof ACTIVITY_RANKING_REFRESH_COMMAND;

const commandSubjects = ['weather.commands.>', 'activity-ranking.commands.>'];

export async function ensureDomainCommandStream(
  manager: JetStreamManager,
): Promise<void> {
  const existing = await manager.streams
    .info(DOMAIN_COMMANDS_STREAM)
    .catch(() => undefined);

  if (existing) {
    assertCommandStream(
      existing.config.subjects,
      existing.config.retention,
      existing.config.storage,
    );
    return;
  }

  try {
    await manager.streams.add({
      name: DOMAIN_COMMANDS_STREAM,
      subjects: commandSubjects,
      retention: RetentionPolicy.Workqueue,
      storage: StorageType.File,
    });
  } catch (error) {
    const createdByAnotherInstance = await manager.streams
      .info(DOMAIN_COMMANDS_STREAM)
      .catch(() => undefined);

    if (!createdByAnotherInstance) {
      throw error;
    }

    assertCommandStream(
      createdByAnotherInstance.config.subjects,
      createdByAnotherInstance.config.retention,
      createdByAnotherInstance.config.storage,
    );
  }
}

function assertCommandStream(
  subjects: string[] | undefined,
  retention: string | undefined,
  storage: string | undefined,
): void {
  const hasInvalidCommandStreamConfiguration =
    retention !== RetentionPolicy.Workqueue ||
    storage !== StorageType.File ||
    !commandSubjects.every((subject) => subjects?.includes(subject));
  if (hasInvalidCommandStreamConfiguration) {
    throw new Error(
      `${DOMAIN_COMMANDS_STREAM} must be a persistent work queue for both domain command subjects`,
    );
  }
}

@Injectable()
export class JetStreamCommandBus implements OnModuleInit, OnModuleDestroy {
  private connection?: Awaited<ReturnType<typeof connect>>;
  private jetStream?: JetStreamClient;
  private ready = false;

  get isReady(): boolean {
    return this.ready;
  }

  async onModuleInit(): Promise<void> {
    this.connection = await connect({ servers: getNatsUrl() });
    const manager = await jetstreamManager(this.connection);
    await ensureDomainCommandStream(manager);
    this.jetStream = jetstream(this.connection);
    this.ready = true;
  }

  async onModuleDestroy(): Promise<void> {
    this.ready = false;
    await this.connection?.drain();
  }

  async publish<TPayload>(
    subject: DomainCommandSubject,
    command: DomainCommand<TPayload>,
  ): Promise<void> {
    if (!this.jetStream || !this.ready) {
      throw new Error('JetStream command bus is not ready');
    }

    await this.jetStream.publish(
      subject,
      new TextEncoder().encode(JSON.stringify(command)),
      { msgID: command.commandId },
    );
  }
}
