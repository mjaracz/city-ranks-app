import type {
  ActivityRankingContext,
  ActivityRankingRule,
} from '../activity-ranking-rule';

import { Inject, Injectable } from '@nestjs/common';

import { Activity, ActivityEvaluation, EvaluationState } from '@libs/models';

import { missingEvaluation, scoredEvaluation } from '../ranking-score';

import { OutdoorSightseeingRule } from './outdoor-sightseeing.rule';

@Injectable()
export class IndoorSightseeingRule implements ActivityRankingRule {
  readonly activity = Activity.INDOOR_SIGHTSEEING;

  constructor(
    @Inject(OutdoorSightseeingRule)
    private readonly outdoorRule: ActivityRankingRule,
  ) {}

  evaluate(context: ActivityRankingContext): ActivityEvaluation {
    const outdoor = this.outdoorRule.evaluate(context);
    if (outdoor.state !== EvaluationState.RANKED)
      return missingEvaluation(this.activity);
    // BQ-07: Indoor preference has a baseline of 40 and rises as outdoor weather worsens.
    return scoredEvaluation(
      this.activity,
      40 + 0.6 * (100 - outdoor.score!),
      'indoor-alternative',
      'Indoor sightseeing remains an option and is preferred more strongly when outdoor weather is poor; venue availability is not assessed.',
    );
  }
}
