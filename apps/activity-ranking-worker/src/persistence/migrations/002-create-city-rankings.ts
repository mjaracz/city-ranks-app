import type { Knex } from 'knex';

export async function up(database: Knex): Promise<void> {
  await database.schema.createTable('city_ranking_results', (table) => {
    table.string('id', 64).primary();
    table.text('location_id').notNullable();
    table.text('policy_version').notNullable();
    table.date('window_start_date').notNullable();
    table.timestamp('weather_fetched_at', { useTz: true }).notNullable();
    table.timestamp('computed_at', { useTz: true }).notNullable();
    table.timestamp('fresh_until', { useTz: true }).notNullable();
    table.jsonb('payload').notNullable();
    table.index(['location_id', 'window_start_date', 'policy_version']);
  });
  await database.schema.createTable('city_ranking_queries', (table) => {
    table.text('query_key').notNullable();
    table.text('policy_version').notNullable();
    table
      .string('result_id', 64)
      .notNullable()
      .references('id')
      .inTable('city_ranking_results');
    table.timestamp('weather_fetched_at', { useTz: true }).notNullable();
    table.timestamp('computed_at', { useTz: true }).notNullable();
    table.primary(['query_key', 'policy_version']);
  });
}

export async function down(database: Knex): Promise<void> {
  await database.schema.dropTable('city_ranking_queries');
  await database.schema.dropTable('city_ranking_results');
}
