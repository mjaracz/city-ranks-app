import type { Knex } from 'knex';

import * as initial from './migrations/001-create-activity-rankings';
import * as cityRankings from './migrations/002-create-city-rankings';

const migrations = {
  '001-create-activity-rankings': initial,
  '002-create-city-rankings': cityRankings,
};

export const activityRankingMigrationSource: Knex.MigrationSource<string> = {
  getMigrations: async () => Object.keys(migrations),
  getMigrationName: (name) => name,
  getMigration: async (name) => {
    if (!migrations[name]) throw new Error(`Unknown ranking migration ${name}`);
    return migrations[name];
  },
};

export async function migrateActivityRanking(database: Knex): Promise<void> {
  await database.migrate.latest({
    migrationSource: activityRankingMigrationSource,
  });
}
