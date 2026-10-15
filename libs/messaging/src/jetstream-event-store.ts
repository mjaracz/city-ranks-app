import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  jetstream,
  jetstreamManager,
  RetentionPolicy,
  StorageType,
} from '@nats-io/jetstream';
import type { JetStreamClient, JetStreamManager } from '@nats-io/jetstream';
import { connect } from '@nats-io/transport-node';
import type { DomainEvent } from '@libs/contracts/domain-event';
import { getNatsUrl } from '@libs/config/environment';

export interface JetStreamEventStoreOptions {
  streamName: string;
  subjectPrefix: string;
}

@Injectable()
export class JetStreamEventStore implements OnModuleInit, OnModuleDestroy {
  private connection?: Awaited<ReturnType<typeof connect>>;
  private jetStream?: JetStreamClient;
  private ready = false;

  constructor(private readonly options: JetStreamEventStoreOptions) {}

  get isReady(): boolean {
    return this.ready;
  }

  async onModuleInit(): Promise<void> {
    this.connection = await connect({ servers: getNatsUrl() });
    const manager = await jetstreamManager(this.connection);
    await this.ensureStream(manager);
    this.jetStream = jetstream(this.connection);
    this.ready = true;
  }

  async onModuleDestroy(): Promise<void> {
    this.ready = false;
    await this.connection?.drain();
  }

  async append<TPayload>(event: DomainEvent<TPayload>): Promise<void> {
    if (!this.jetStream || !this.ready) {
      throw new Error('JetStream event store is not ready');
    }

    const subject = `${this.options.subjectPrefix}.${event.eventType}.v${event.schemaVersion}`;
    const payload = new TextEncoder().encode(JSON.stringify(event));

    await this.jetStream.publish(subject, payload, { msgID: event.eventId });
  }

  private async ensureStream(manager: JetStreamManager): Promise<void> {
    const existing = await manager.streams
      .info(this.options.streamName)
      .catch(() => undefined);

    if (existing) {
      this.assertStreamSubject(existing.config.subjects);
      return;
    }

    try {
      await manager.streams.add({
        name: this.options.streamName,
        subjects: [`${this.options.subjectPrefix}.>`],
        retention: RetentionPolicy.Limits,
        storage: StorageType.File,
      });
    } catch (error) {
      const createdByAnotherInstance = await manager.streams
        .info(this.options.streamName)
        .catch(() => undefined);

      if (!createdByAnotherInstance) {
        throw error;
      }

      this.assertStreamSubject(createdByAnotherInstance.config.subjects);
    }
  }

  private assertStreamSubject(subjects: string[] | undefined): void {
    if (!subjects?.includes(`${this.options.subjectPrefix}.>`)) {
      throw new Error(
        `JetStream stream ${this.options.streamName} has an incompatible subject configuration`,
      );
    }
  }
}
