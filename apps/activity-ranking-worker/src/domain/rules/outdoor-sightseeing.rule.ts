import { Injectable } from '@nestjs/common';
import { Activity, ActivityEvaluation } from '@libs/models';
import { OutdoorRankingConditionsDto } from '../../dto/ranking-conditions.dto';
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
export class OutdoorSightseeingRule implements ActivityRankingRule {
  readonly activity = Activity.OUTDOOR_SIGHTSEEING;

  evaluate({ day }: ActivityRankingContext): ActivityEvaluation {
    const conditions = toValidatedRankingInput(
      OutdoorRankingConditionsDto,
      day,
    );
    if (!conditions) return missingEvaluation(this.activity);
    if (conditions.weatherCode >= 95) {
      return scoredEvaluation(
        this.activity,
        0,
        'thunderstorm',
        'Thunderstorms make outdoor weather unsuitable.',
      );
    }
    // BQ-04: Provisional comfort target is 20 C; rain and high wind reduce preference.
    const temperature =
      (conditions.temperatureMinCelsius + conditions.temperatureMaxCelsius) / 2;
    const score = clampScore(
      100 -
        3 * Math.abs(temperature - 20) -
        5 * conditions.precipitationMillimeters -
        Math.max(0, conditions.windSpeedMaxKilometersPerHour - 15) * 1.5,
    );
    return scoredEvaluation(
      this.activity,
      score,
      'outdoor-comfort',
      'Mild temperatures, low precipitation and light wind favor outdoor sightseeing.',
    );
  }
}
