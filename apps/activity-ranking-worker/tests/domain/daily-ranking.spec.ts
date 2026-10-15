import {
  Activity,
  ActivityEvaluation,
  Completeness,
  EvaluationState,
} from '@libs/models';

import { rankDay } from '../../src/domain/daily-ranking';

const evaluations = (
  scores = [90.004, 90.001, 70, 10.075],
): ActivityEvaluation[] =>
  Object.values(Activity).map((activity, index) => ({
    activity,
    state: EvaluationState.RANKED,
    score: scores[index],
    rank: null,
    reasonCodes: ['v1.test'],
    explanation: 'Test',
  }));

describe('Daily competition ranking', () => {
  it('rounds half up before comparison and preserves competition ties', () => {
    const input = evaluations();
    const original = structuredClone(input);
    const result = rankDay('2026-10-14', input);
    expect(result.activities.map((item) => item.score)).toEqual([
      90, 90, 70, 10.08,
    ]);
    expect(result.activities.map((item) => item.rank)).toEqual([1, 1, 3, 4]);
    expect(input).toEqual(original);
  });
  it('places unavailable activities after ranked zero scores', () => {
    const input = evaluations([0, 0, 0, 0]);
    input[0] = {
      ...input[0],
      state: EvaluationState.INSUFFICIENT_DATA,
      score: null,
    };
    const result = rankDay('2026-10-14', input);
    expect(result.completeness).toBe(Completeness.PARTIAL);
    expect(result.activities.map((item) => item.rank)).toEqual([1, 1, 1, null]);
  });
  it('rejects unavailable results with a score or a rank', () => {
    const input = evaluations();
    input[0].state = EvaluationState.NOT_APPLICABLE;
    expect(() => rankDay('2026-10-14', input)).toThrow(RangeError);
    input[0].score = null;
    input[0].rank = 1;
    expect(() => rankDay('2026-10-14', input)).toThrow(RangeError);
  });
  it('rejects collections that omit or duplicate an activity', () => {
    expect(() => rankDay('2026-10-14', evaluations().slice(1))).toThrow(
      RangeError,
    );
    const duplicate = evaluations();
    duplicate[0].activity = duplicate[1].activity;
    expect(() => rankDay('2026-10-14', duplicate)).toThrow(RangeError);
  });
});
