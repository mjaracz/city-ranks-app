import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  ActivityEvaluation,
  CityForecast,
  CityRanking,
  DailyWeatherForecast,
  EvaluationState,
  MarineStatus,
} from '@libs/models';
import { validateRankingForecast } from '../utils/ranking-policy.validation';
import {
  ACTIVITY_RANKING_RULES,
  ActivityRankingRule,
} from './activity-ranking-rule';
import { rankDay } from './daily-ranking';
import { rankingCompleteness } from './ranking-score';

// BQ-03/BQ-04: Scores describe provisional weather preference on a shared 0-100 scale.
export const RANKING_POLICY_VERSION = 'weather-suitability-v1';

@Injectable()
export class RankingPolicy {
  readonly version = RANKING_POLICY_VERSION;

  constructor(
    @Inject(ACTIVITY_RANKING_RULES)
    private readonly rules: readonly ActivityRankingRule[],
  ) {}

  evaluateActivities(
    day: DailyWeatherForecast,
    marineStatus: MarineStatus,
  ): ActivityEvaluation[] {
    const context = { day, marineStatus };
    return this.rules.map((rule) => rule.evaluate(context));
  }

  calculate(forecast: CityForecast, computedAt = new Date()): CityRanking {
    validateRankingForecast(forecast);
    const days = forecast.days.map((day) =>
      rankDay(day.date, this.evaluateActivities(day, forecast.marineStatus)),
    );
    const id = createHash('sha256')
      .update(forecast.snapshotId + ':' + this.version)
      .digest('hex');
    return {
      id,
      city: forecast.city,
      windowStartDate: days[0].date,
      windowEndDate: days[6].date,
      completeness: rankingCompleteness(
        days
          .flatMap((day) => day.activities)
          .filter((item) => item.state === EvaluationState.RANKED).length,
        28,
      ),
      policyVersion: this.version,
      forecastSnapshotId: forecast.snapshotId,
      weatherFetchedAt: forecast.weatherFetchedAt,
      marineFetchedAt: forecast.marineFetchedAt,
      freshUntil: forecast.freshUntil,
      computedAt: computedAt.toISOString(),
      days,
    };
  }
}
