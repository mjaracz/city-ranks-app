import { Injectable } from '@nestjs/common';
import { Activity, ActivityEvaluation } from '@libs/models';
import { SkiingRankingConditionsDto } from '../../dto/ranking-conditions.dto';
import { toValidatedRankingInput } from '../../utils/ranking-policy.validation';
import {
  ActivityRankingContext,
  ActivityRankingRule,
} from '../activity-ranking-rule';
import {
  clampScore,
  missingEvaluation,
  scoredEvaluation,
} from '../ranking-score';

@Injectable()
export class SkiingRule implements ActivityRankingRule {
  readonly activity = Activity.SKIING;

  evaluate({ day }: ActivityRankingContext): ActivityEvaluation {
    const conditions = toValidatedRankingInput(SkiingRankingConditionsDto, day);
    if (!conditions) return missingEvaluation(this.activity);
    // BQ-05: City-grid snow depth is a proxy; this does not establish a ski facility.
    const snow = Math.min(1, conditions.snowDepthMaxMeters / 0.3);
    const temperature =
      (conditions.temperatureMinCelsius + conditions.temperatureMaxCelsius) / 2;
    const comfort = clampScore(
      100 -
        5 * Math.abs(temperature + 5) -
        2 * Math.max(0, conditions.windSpeedMaxKilometersPerHour - 20) -
        2 * Math.max(0, conditions.snowfallCentimeters - 10),
    );
    const thunderstorm = conditions.weatherCode >= 95;
    return scoredEvaluation(
      this.activity,
      thunderstorm ? 0 : snow * comfort,
      thunderstorm
        ? 'thunderstorm'
        : snow === 0
          ? 'no-snow-cover'
          : 'ski-weather',
      'Snow cover, cold temperatures and moderate wind determine skiing weather suitability at the city grid; resorts and slope conditions are not assessed.',
    );
  }
}
