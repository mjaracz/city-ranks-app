import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { Activity, ActivityEvaluation, EvaluationState } from '@libs/models';

import { forecastFixture } from '../../../city-ranking-test.fixtures';
import {
  DailyRankingInputDto,
  ForecastRankingInputDto,
} from '../../src/dto/ranking-policy.dto';

const evaluations = (): ActivityEvaluation[] =>
  Object.values(Activity).map((activity) => ({
    activity,
    state: EvaluationState.RANKED,
    score: 0,
    rank: null,
    reasonCodes: ['v1.test'],
    explanation: 'Test',
  }));
const validate = (items: unknown) =>
  validateSync(
    plainToInstance(
      DailyRankingInputDto,
      { evaluations: items },
      { enableImplicitConversion: false },
    ),
  );

describe('Ranking policy input DTOs', () => {
  it('accepts the four supported activities with valid zero and maximum scores', () => {
    const items = evaluations();
    items[0].score = 100;
    expect(validate(items)).toEqual([]);
  });
  it.each([null, undefined, '50', NaN, Infinity, -1, 101])(
    'rejects invalid ranked scores: %s',
    (score) => {
      const items = evaluations();
      items[0].score = score as number;
      expect(validate(items).length).toBeGreaterThan(0);
    },
  );
  it.each([EvaluationState.INSUFFICIENT_DATA, EvaluationState.NOT_APPLICABLE])(
    'requires null score and rank for %s',
    (state) => {
      const items = evaluations();
      items[0] = { ...items[0], state, score: null, rank: null };
      expect(validate(items)).toEqual([]);
      items[0].score = 0;
      expect(validate(items).length).toBeGreaterThan(0);
      items[0].score = null;
      items[0].rank = 1;
      expect(validate(items).length).toBeGreaterThan(0);
    },
  );
  it('rejects duplicates, missing activities and unknown states or activities', () => {
    expect(validate(evaluations().slice(1)).length).toBeGreaterThan(0);
    const duplicate = evaluations();
    duplicate[1].activity = duplicate[0].activity;
    expect(validate(duplicate).length).toBeGreaterThan(0);
    const unknown = evaluations();
    unknown[0].state = 'UNKNOWN' as EvaluationState;
    expect(validate(unknown).length).toBeGreaterThan(0);
    unknown[0].state = EvaluationState.RANKED;
    unknown[0].activity = 'UNKNOWN' as Activity;
    expect(validate(unknown).length).toBeGreaterThan(0);
  });
  it.each([0, 6, 7, 8])(
    'accepts only seven forecast days (received %s)',
    (count) => {
      const days = Array.from(
        { length: count },
        () => forecastFixture().days[0],
      );
      const errors = validateSync(
        plainToInstance(ForecastRankingInputDto, { days }),
      );
      expect(errors.length === 0).toBe(count === 7);
    },
  );
});
