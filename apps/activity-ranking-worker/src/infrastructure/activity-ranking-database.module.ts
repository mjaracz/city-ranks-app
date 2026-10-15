import type { Knex } from 'knex';

import {
  Inject,
  Injectable,
  Module,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import {
  ACTIVITY_RANKING_KNEX,
  createActivityRankingKnex,
} from './activity-ranking-knex';

@Injectable()
class ActivityRankingDatabaseLifecycle
  implements OnModuleInit, OnModuleDestroy
{
  constructor(@Inject(ACTIVITY_RANKING_KNEX) private readonly database: Knex) {}

  async onModuleInit(): Promise<void> {
    try {
      const hasMissingRankingTables =
        !(await this.database.schema.hasTable('activity_rankings')) ||
        !(await this.database.schema.hasTable('city_ranking_results')) ||
        !(await this.database.schema.hasTable('city_ranking_queries'));
      if (hasMissingRankingTables) {
        throw new Error(
          'Activity ranking schema is missing; run pnpm db:migrate:activity-ranking',
        );
      }
    } catch (error) {
      await this.database.destroy();
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.database.destroy();
  }
}

@Module({
  providers: [
    { provide: ACTIVITY_RANKING_KNEX, useFactory: createActivityRankingKnex },
    ActivityRankingDatabaseLifecycle,
  ],
  exports: [ACTIVITY_RANKING_KNEX],
})
export class ActivityRankingDatabaseModule {}
