import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { ACTIVITY_RANKING_KNEX } from './persistence/activity-ranking-knex';
import {
  ActivityFactor,
  ActivityRanking,
  ActivityRankingRepository,
  ActivityType,
} from './activity-ranking.repository';
import {
  validateRankingPeriod,
  validateRankings,
} from './activity-ranking.validation';

interface ActivityRankingRow {
  city: string;
  activity: ActivityType;
  forecast_date: string;
  score: string | number;
  factors: ActivityFactor;
  weather_updated_at: Date | null;
  calculated_at: Date;
}

@Injectable()
export class PostgresActivityRankingRepository extends ActivityRankingRepository {
  constructor(@Inject(ACTIVITY_RANKING_KNEX) private readonly database: Knex) {
    super();
  }

  async saveRankings(rankings: readonly ActivityRanking[]): Promise<void> {
    validateRankings(rankings);
    if (rankings.length === 0) return;

    const unique = new Map<string, ActivityRankingRow>();
    for (const ranking of rankings) {
      unique.set(
        JSON.stringify([ranking.city, ranking.activity, ranking.forecastDate]),
        {
          city: ranking.city,
          activity: ranking.activity,
          forecast_date: ranking.forecastDate,
          score: ranking.score,
          factors: ranking.factors,
          weather_updated_at: ranking.weatherUpdatedAt,
          calculated_at: ranking.calculatedAt,
        },
      );
    }
    const rows = [...unique.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, row]) => row);
    await this.database.transaction(async (transaction) => {
      for (let offset = 0; offset < rows.length; offset += 500) {
        await transaction<ActivityRankingRow>('activity_rankings')
          .insert(rows.slice(offset, offset + 500))
          .onConflict(['city', 'activity', 'forecast_date'])
          .merge(['score', 'factors', 'weather_updated_at', 'calculated_at']);
      }
    });
  }

  async findByCityAndPeriod(
    city: string,
    from: string,
    until: string,
  ): Promise<ActivityRanking[]> {
    validateRankingPeriod(city, from, until);
    const rows = await this.database<ActivityRankingRow>('activity_rankings')
      .select<ActivityRankingRow[]>(
        'city',
        'activity',
        'score',
        'factors',
        'weather_updated_at',
        'calculated_at',
        this.database.raw('??::text as ??', ['forecast_date', 'forecast_date']),
      )
      .where('city', city)
      .where('forecast_date', '>=', from)
      .where('forecast_date', '<', until)
      .orderBy('forecast_date')
      .orderBy('score', 'desc')
      .orderBy('activity');

    return rows.map((row) => ({
      city: row.city,
      activity: row.activity,
      forecastDate: row.forecast_date,
      score: Number(row.score),
      factors: row.factors,
      weatherUpdatedAt: row.weather_updated_at,
      calculatedAt: row.calculated_at,
    }));
  }
}
