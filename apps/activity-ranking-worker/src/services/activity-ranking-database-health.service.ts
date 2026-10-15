import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { ACTIVITY_RANKING_KNEX } from '../infrastructure/activity-ranking-knex';

@Injectable()
export class ActivityRankingDatabaseHealth {
  constructor(@Inject(ACTIVITY_RANKING_KNEX) private readonly database: Knex) {}

  async isAvailable(): Promise<boolean> {
    try {
      await this.database('activity_rankings').select('city').limit(0);
      return true;
    } catch {
      return false;
    }
  }
}
