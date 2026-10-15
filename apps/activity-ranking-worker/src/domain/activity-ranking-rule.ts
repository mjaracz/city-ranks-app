import {
  Activity,
  ActivityEvaluation,
  DailyWeatherForecast,
  MarineStatus,
} from '@libs/models';

export interface ActivityRankingContext {
  readonly day: Readonly<DailyWeatherForecast>;
  readonly marineStatus: MarineStatus;
}

export interface ActivityRankingRule {
  readonly activity: Activity;
  evaluate(context: ActivityRankingContext): ActivityEvaluation;
}

export const ACTIVITY_RANKING_RULES = Symbol('ACTIVITY_RANKING_RULES');
