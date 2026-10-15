import knex from 'knex';
import type { Knex } from 'knex';
import {
  getRequiredDatabaseUrl,
  getPositiveInteger,
} from '@libs/config/environment';

export const ACTIVITY_RANKING_KNEX = Symbol('ACTIVITY_RANKING_KNEX');

export function createActivityRankingKnex(): Knex {
  return knex({
    client: 'pg',
    connection: getRequiredDatabaseUrl('ACTIVITY_RANKING_DATABASE_URL'),
    pool: {
      min: 0,
      max: getPositiveInteger('ACTIVITY_RANKING_DB_POOL_MAX', 10),
    },
    acquireConnectionTimeout: 5000,
    compileSqlOnError: false,
  });
}
