import 'dotenv/config';

import process from 'node:process';

import { createActivityRankingKnex } from '../apps/activity-ranking-worker/src/infrastructure/activity-ranking-knex';
import { migrateActivityRanking } from '../apps/activity-ranking-worker/src/infrastructure/activity-ranking-migrations';

async function main(): Promise<void> {
  const database = createActivityRankingKnex();
  try {
    await migrateActivityRanking(database);
  } finally {
    await database.destroy();
  }
  console.log('Activity ranking migrations applied');
}

void main().catch((error: unknown) => {
  console.error(
    'Activity ranking migration failed; verify database connectivity and migration state',
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
