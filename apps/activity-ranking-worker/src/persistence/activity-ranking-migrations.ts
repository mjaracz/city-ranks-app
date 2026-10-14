import type { Knex } from 'knex';
import * as initial from './migrations/001-create-activity-rankings';

export const activityRankingMigrationSource: Knex.MigrationSource<string> = {
  getMigrations: async () => ['001-create-activity-rankings'],
  getMigrationName: (name) => name,
  getMigration: async () => initial,
};

export async function migrateActivityRanking(database: Knex): Promise<void> {
  await database.migrate.latest({
    migrationSource: activityRankingMigrationSource,
  });
}
