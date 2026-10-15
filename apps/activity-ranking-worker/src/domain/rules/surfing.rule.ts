import { Injectable } from '@nestjs/common';
import { Activity, ActivityEvaluation, EvaluationState } from '@libs/models';
import { SurfingRankingConditionsDto } from '../../dto/ranking-conditions.dto';
import { toValidatedRankingInput } from '../../utils/ranking-policy.validation';
import {
  ActivityRankingContext,
  ActivityRankingRule,
} from '../activity-ranking-rule';
import {
  clampScore,
  missingEvaluation,
  scoredEvaluation,
  unavailableEvaluation,
} from '../ranking-score';

@Injectable()
export class SurfingRule implements ActivityRankingRule {
  readonly activity = Activity.SURFING;

  evaluate({ day, marineStatus }: ActivityRankingContext): ActivityEvaluation {
    if (marineStatus === 'NOT_APPLICABLE') {
      return unavailableEvaluation(
        this.activity,
        EvaluationState.NOT_APPLICABLE,
        'marine-grid-outside-city',
        'The available marine grid is more than 50 km from the city, outside this policy evaluation radius.',
      );
    }
    const conditions = toValidatedRankingInput(
      SurfingRankingConditionsDto,
      day,
    );
    if (marineStatus !== 'AVAILABLE' || !conditions)
      return missingEvaluation(this.activity);
    // BQ-06: Daily wave maxima are a heuristic, with a provisional target of 1.5 m.
    const wave = clampScore(
      100 - Math.abs(conditions.waveHeightMaxMeters - 1.5) * (100 / 1.5),
    );
    const period = Math.min(1, conditions.wavePeriodMaxSeconds / 10);
    const wind =
      clampScore(
        100 - 3 * Math.max(0, conditions.windSpeedMaxKilometersPerHour - 15),
      ) / 100;
    const thunderstorm = conditions.weatherCode >= 95;
    return scoredEvaluation(
      this.activity,
      thunderstorm ? 0 : wave * period * wind,
      thunderstorm ? 'thunderstorm' : 'surf-weather',
      thunderstorm
        ? 'Thunderstorms make surfing weather unsuitable.'
        : 'Moderate waves, longer wave periods and light wind favor surfing weather; beach access, tides and local hazards are not assessed.',
    );
  }
}
