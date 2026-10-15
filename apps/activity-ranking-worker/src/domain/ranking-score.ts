import {
  Activity,
  ActivityEvaluation,
  Completeness,
  EvaluationState,
} from '@libs/models';

export const clampScore = (value: number): number =>
  Math.max(0, Math.min(100, value));

export function roundScore(value: number): number {
  const [coefficient, exponent = '0'] = clampScore(value).toString().split('e');
  return Number(
    Math.round(Number(coefficient + 'e' + (Number(exponent) + 2))) + 'e-2',
  );
}

export function unavailableEvaluation(
  activity: Activity,
  state: EvaluationState,
  reason: string,
  explanation: string,
): ActivityEvaluation {
  return {
    activity,
    state,
    score: null,
    rank: null,
    reasonCodes: ['v1.' + reason],
    explanation,
  };
}

export function missingEvaluation(activity: Activity): ActivityEvaluation {
  // BQ-10: Should unknown observations exclude an activity or imply pessimistic suitability?
  return unavailableEvaluation(
    activity,
    EvaluationState.INSUFFICIENT_DATA,
    'missing-observations',
    'Required weather observations are unavailable for this day.',
  );
}

export function scoredEvaluation(
  activity: Activity,
  score: number,
  reason: string,
  explanation: string,
): ActivityEvaluation {
  return {
    activity,
    state: EvaluationState.RANKED,
    score: roundScore(score),
    rank: null,
    reasonCodes: ['v1.' + reason],
    explanation,
  };
}

export function rankingCompleteness(
  count: number,
  total: number,
): Completeness {
  return count === 0
    ? Completeness.UNAVAILABLE
    : count === total
      ? Completeness.COMPLETE
      : Completeness.PARTIAL;
}
