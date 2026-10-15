import { AckPolicy, jetstream, jetstreamManager } from '@nats-io/jetstream';
import type { ConsumerMessages } from '@nats-io/jetstream';
import { connect } from '@nats-io/transport-node';
import type { DomainCommand } from '@libs/contracts/domain-command';
import { getNatsUrl } from '@libs/config/environment';
import { DOMAIN_COMMANDS_STREAM } from '@libs/contracts/message-patterns';
import {
  type DomainCommandSubject,
  ensureDomainCommandStream,
} from './jetstream-command-bus';

export interface JetStreamCommandConsumerOptions {
  durableName: string;
  subject: DomainCommandSubject;
}

export interface DomainCommandConsumer {
  readonly isReady: boolean;
  start<TPayload>(
    handler: (command: DomainCommand<TPayload>) => Promise<void>,
  ): Promise<void>;
  stop(): Promise<void>;
}

export class JetStreamCommandConsumer implements DomainCommandConsumer {
  private connection?: Awaited<ReturnType<typeof connect>>;
  private messages?: ConsumerMessages;
  private ready = false;

  constructor(private readonly options: JetStreamCommandConsumerOptions) {}

  get isReady(): boolean {
    return this.ready;
  }

  async start<TPayload>(
    handler: (command: DomainCommand<TPayload>) => Promise<void>,
  ): Promise<void> {
    this.connection = await connect({ servers: getNatsUrl() });
    try {
      const manager = await jetstreamManager(this.connection);
      await ensureDomainCommandStream(manager);
      await manager.consumers
        .add(DOMAIN_COMMANDS_STREAM, {
          durable_name: this.options.durableName,
          filter_subject: this.options.subject,
          ack_policy: AckPolicy.Explicit,
          max_deliver: 5,
        })
        .catch(async (error) => {
          const existing = await manager.consumers
            .info(DOMAIN_COMMANDS_STREAM, this.options.durableName)
            .catch(() => undefined);
          const hasIncompatibleExistingConsumer =
            !existing ||
            existing.config.filter_subject !== this.options.subject ||
            existing.config.ack_policy !== AckPolicy.Explicit;
          if (hasIncompatibleExistingConsumer) {
            throw error;
          }
        });

      const consumer = await jetstream(this.connection).consumers.get(
        DOMAIN_COMMANDS_STREAM,
        this.options.durableName,
      );
      this.messages = await consumer.consume({ max_messages: 10 });
      this.ready = true;
      void this.consume(handler);
    } catch (error) {
      await this.connection.drain();
      this.connection = undefined;
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.ready = false;
    await this.messages?.close();
    await this.connection?.drain();
    this.messages = undefined;
    this.connection = undefined;
  }

  private async consume<TPayload>(
    handler: (command: DomainCommand<TPayload>) => Promise<void>,
  ): Promise<void> {
    if (!this.messages) {
      return;
    }

    try {
      for await (const message of this.messages) {
        try {
          const command = JSON.parse(
            new TextDecoder().decode(message.data),
          ) as DomainCommand<TPayload>;
          await handler(command);
          message.ack();
        } catch {
          message.nak();
        }
      }
    } catch {
      this.ready = false;
    }
  }
}
