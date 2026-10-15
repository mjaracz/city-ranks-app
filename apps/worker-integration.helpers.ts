import type { DomainEvent } from '@libs/contracts/domain-event';

import { jetstreamManager } from '@nats-io/jetstream';
import { connect } from '@nats-io/transport-node';

import { getNatsUrl } from '@libs/config/environment';

import { createActivityRankingKnex } from './activity-ranking-worker/src/infrastructure/activity-ranking-knex';
import { migrateActivityRanking } from './activity-ranking-worker/src/infrastructure/activity-ranking-migrations';

export async function ensureRankingSchema(): Promise<void> {
  const database = createActivityRankingKnex();
  try {
    await migrateActivityRanking(database);
  } finally {
    await database.destroy();
  }
}

export async function waitForEvent<TPayload>(
  streamName: string,
  subject: string,
  eventId: string,
): Promise<DomainEvent<TPayload>> {
  const connection = await connect({ servers: getNatsUrl() });
  const manager = await jetstreamManager(connection);
  const deadline = Date.now() + 8000;

  try {
    while (Date.now() < deadline) {
      const stored = await manager.streams
        .getMessage(streamName, { last_by_subj: subject })
        .catch(() => null);
      if (stored) {
        const event = JSON.parse(
          new TextDecoder().decode(stored.data),
        ) as DomainEvent<TPayload>;
        if (event.eventId === eventId) {
          return event;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } finally {
    await connection.drain();
  }

  throw new Error(`Timed out waiting for event ${eventId} in ${streamName}`);
}
