import type { Knex } from 'knex';

export async function up(database: Knex): Promise<void> {
  await database.schema.createTable('activity_rankings', (table) => {
    table.text('city').notNullable();
    table
      .text('activity')
      .notNullable()
      .checkIn([
        'skiing',
        'surfing',
        'outdoor-sightseeing',
        'indoor-sightseeing',
      ]);
    table.date('forecast_date').notNullable();
    table.decimal('score', 5, 2).notNullable().checkBetween([0, 100]);
    table.jsonb('factors').notNullable().defaultTo('{}');
    table.timestamp('weather_updated_at', { useTz: true }).nullable();
    table.timestamp('calculated_at', { useTz: true }).notNullable();
    table.primary(['city', 'activity', 'forecast_date']);
    table.index(['city', 'forecast_date'], 'activity_rankings_city_date');
  });
}

export async function down(database: Knex): Promise<void> {
  await database.schema.dropTable('activity_rankings');
}
