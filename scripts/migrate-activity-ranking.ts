import 'dotenv/config';
import { createActivityRankingKnex } from '../apps/activity-ranking-worker/src/infrastructure/activity-ranking-knex';
import { migrateActivityRanking } from '../apps/activity-ranking-worker/src/infrastructure/activity-ranking-migrations';

async function main(): Promise<void> {
  const database = createActivityRankingKnex();
  try {
    await migrateActivityRanking(database);
    console.log('Activity ranking migrations applied');
  } finally {
    await database.destroy();
  }
}

void main().catch(() => {
  console.error(
    'Activity ranking migration failed; verify database connectivity and migration state',
  );
  process.exitCode = 1;
});
