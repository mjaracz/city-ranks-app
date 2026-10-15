import type { ValidationArguments } from 'class-validator';

import {
  RankingPeriodLength,
  ScalarActivityFactors,
} from '../../src/utils/activity-ranking.constraints';

describe('Activity ranking constraints', () => {
  const period = new RankingPeriodLength();
  const factors = new ScalarActivityFactors();
  const periodArguments = (from: unknown): ValidationArguments => ({
    object: { from },
    property: 'until',
    constraints: [],
    targetName: 'ActivityRankingPeriodDto',
    value: undefined,
  });

  it.each<[string, string, boolean]>([
    ['2026-10-14', '2026-10-15', true],
    ['2026-10-01', '2026-11-01', true],
    ['2026-10-01', '2026-11-02', false],
    ['2026-10-14', '2026-10-14', false],
    ['2026-10-15', '2026-10-14', false],
    ['2028-02-28', '2028-03-01', true],
    ['2026-02-30', '2026-03-02', false],
    ['invalid', '2026-10-15', false],
  ])('checks the period %s to %s', (from, until, expected) => {
    expect(period.validate(until, periodArguments(from))).toBe(expected);
  });

  it('rejects absent period dates', () => {
    expect(period.validate(undefined, periodArguments(null))).toBe(false);
  });

  it.each([{}, { zero: 0, no: false, empty: '', gap: null }, { score: 100 }])(
    'accepts finite scalar factors %p',
    (value) => expect(factors.validate(value)).toBe(true),
  );

  it.each([
    undefined,
    null,
    [],
    'value',
    { nested: {} },
    { list: [] },
    { missing: undefined },
    { score: NaN },
    { score: Infinity },
    { date: new Date() },
  ])('rejects unsupported factor values %p', (value) => {
    expect(factors.validate(value)).toBe(false);
  });
});
