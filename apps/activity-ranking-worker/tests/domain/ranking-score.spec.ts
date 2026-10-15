import { Activity, Completeness, EvaluationState } from '@libs/models';

import {
  clampScore,
  missingEvaluation,
  rankingCompleteness,
  roundScore,
  scoredEvaluation,
  unavailableEvaluation,
} from '../../src/domain/ranking-score';

describe('Ranking score outcomes', () => {
  it.each([
    [-1, 0],
    [0, 0],
    [10.075, 10.08],
    [90.004, 90],
    [100, 100],
    [101, 100],
  ])('bounds and rounds %s to %s', (value, expected) => {
    expect(roundScore(value)).toBe(expected);
    expect(clampScore(value)).toBeGreaterThanOrEqual(0);
    expect(clampScore(value)).toBeLessThanOrEqual(100);
  });
  it('distinguishes a ranked zero from missing and not applicable results', () => {
    expect(
      scoredEvaluation(Activity.SKIING, 0, 'no-snow-cover', 'No snow'),
    ).toMatchObject({
      state: EvaluationState.RANKED,
      score: 0,
      rank: null,
      reasonCodes: ['v1.no-snow-cover'],
    });
    expect(missingEvaluation(Activity.SKIING)).toMatchObject({
      state: EvaluationState.INSUFFICIENT_DATA,
      score: null,
      rank: null,
    });
    expect(
      unavailableEvaluation(
        Activity.SURFING,
        EvaluationState.NOT_APPLICABLE,
        'marine-grid-outside-city',
        'Too far',
      ),
    ).toMatchObject({
      state: EvaluationState.NOT_APPLICABLE,
      score: null,
      rank: null,
    });
  });
  it.each<[number, Completeness]>([
    [0, Completeness.UNAVAILABLE],
    [1, Completeness.PARTIAL],
    [4, Completeness.COMPLETE],
  ])('reports completeness for %s ranked activities', (count, expected) => {
    expect(rankingCompleteness(count, 4)).toBe(expected);
  });
});
