import type { Knex } from 'knex';

import type { CityRanking } from '@libs/models';

import { Inject, Injectable } from '@nestjs/common';

import { CityRankingRepository } from './city-ranking.repository';
import { validateCityRanking } from './domain/ranking-validation';
import { ACTIVITY_RANKING_KNEX } from './infrastructure/activity-ranking-knex';

@Injectable()
export class PostgresCityRankingRepository extends CityRankingRepository {
  constructor(@Inject(ACTIVITY_RANKING_KNEX) private readonly database: Knex) {
    super();
  }

  async findById(id: string): Promise<CityRanking | null> {
    const row = await this.database('city_ranking_results')
      .where('id', id)
      .select('payload')
      .first();
    return row?.payload ?? null;
  }

  async findFresh(
    queryKey: string,
    policyVersion: string,
  ): Promise<CityRanking | null> {
    const row = await this.database('city_ranking_queries as query')
      .join('city_ranking_results as result', 'result.id', 'query.result_id')
      .where('query.query_key', queryKey)
      .where('query.policy_version', policyVersion)
      .where('result.fresh_until', '>', new Date())
      .select('result.payload')
      .first();
    return row?.payload ?? null;
  }

  async save(queryKey: string, ranking: CityRanking): Promise<void> {
    validateCityRanking(ranking);
    await this.database.transaction(async (transaction) => {
      await transaction('city_ranking_results')
        .insert({
          id: ranking.id,
          location_id: ranking.city.id,
          policy_version: ranking.policyVersion,
          window_start_date: ranking.windowStartDate,
          weather_fetched_at: ranking.weatherFetchedAt,
          computed_at: ranking.computedAt,
          fresh_until: ranking.freshUntil,
          payload: JSON.stringify(ranking),
        })
        .onConflict('id')
        .ignore();
      await transaction('city_ranking_queries')
        .insert({
          query_key: queryKey,
          policy_version: ranking.policyVersion,
          result_id: ranking.id,
          weather_fetched_at: ranking.weatherFetchedAt,
          computed_at: ranking.computedAt,
        })
        .onConflict(['query_key', 'policy_version'])
        .merge(['result_id', 'weather_fetched_at', 'computed_at'])
        .whereRaw(
          '(excluded.weather_fetched_at, excluded.computed_at) >= (city_ranking_queries.weather_fetched_at, city_ranking_queries.computed_at)',
        );
    });
  }
}
