import type { ActivityRanking } from '../../src/activity-ranking.repository';

import {
  validateCity,
  validateRankingPeriod,
  validateRankings,
} from '../../src/utils/activity-ranking.validation';

const ranking = (): ActivityRanking => ({
  city: 'Warsaw',
  activity: 'skiing',
  forecastDate: '2028-02-29',
  score: 0,
  factors: { snow: 0, available: false, source: '', missing: null },
  calculatedAt: new Date('2028-02-28T12:00:00Z'),
  weatherUpdatedAt: null,
});

describe('Activity ranking validation', () => {
  it.each(['Warsaw', '  Warsaw  ', 'x'.repeat(120)])(
    'accepts valid city %s without changing it',
    (city) => expect(() => validateCity(city)).not.toThrow(),
  );

  it.each([undefined, null, 12, {}, [], '', ' \t\n', 'x'.repeat(121)])(
    'rejects invalid city input %p',
    (city) => expect(() => validateCity(city)).toThrow(RangeError),
  );

  it.each([
    ['2026-10-14', '2026-10-15'],
    ['2026-10-01', '2026-11-01'],
    ['2028-02-29', '2028-03-01'],
    ['2026-12-31', '2027-01-01'],
  ])('accepts the exclusive-end interval %s to %s', (from, until) => {
    expect(() => validateRankingPeriod('Warsaw', from, until)).not.toThrow();
  });

  it.each<[unknown, unknown]>([
    ['2026-10-14', '2026-10-14'],
    ['2026-10-15', '2026-10-14'],
    ['2026-10-01', '2026-11-02'],
    ['2026-02-30', '2026-03-01'],
    ['2026-02-29', '2026-03-01'],
    ['2026-10-14', '2026-02-30'],
    ['2026-10-14T00:00:00Z', '2026-10-15'],
    ['2026-10-14', '2026-10-15T00:00:00Z'],
    ['14-10-2026', '2026-10-15'],
    [20261014, '2026-10-15'],
    ['2026-10-14', null],
    [undefined, '2026-10-15'],
  ])('rejects an invalid interval %p to %p', (from, until) => {
    expect(() => validateRankingPeriod('Warsaw', from, until)).toThrow(
      RangeError,
    );
  });

  it('validates the city on period queries', () => {
    expect(() => validateRankingPeriod('', '2026-10-14', '2026-10-15')).toThrow(
      'City must contain 1 to 120 characters',
    );
  });

  it('accepts empty batches and the maximum batch size', () => {
    expect(() => validateRankings([])).not.toThrow();
    expect(() =>
      validateRankings(Array.from({ length: 1000 }, ranking)),
    ).not.toThrow();
    expect(() =>
      validateRankings(Array.from({ length: 1001 }, ranking)),
    ).toThrow('A ranking batch must contain at most 1000 records');
  });

  it.each(['skiing', 'surfing', 'outdoor-sightseeing', 'indoor-sightseeing'])(
    'accepts supported activity %s at both score boundaries',
    (activity) => {
      expect(() =>
        validateRankings([
          { ...ranking(), activity, score: 0 },
          { ...ranking(), activity, score: 100 },
        ]),
      ).not.toThrow();
    },
  );

  it('preserves valid scalar factors, dates and the original batch', () => {
    const batch = [
      { ...ranking(), weatherUpdatedAt: new Date('2028-02-28T11:00:00Z') },
    ];
    const original = structuredClone(batch);
    validateRankings(batch);
    expect(batch).toEqual(original);
  });

  it.each([undefined, null, {}, 'ranking', [null], [1], [[]]])(
    'rejects a malformed batch %p',
    (batch) => expect(() => validateRankings(batch)).toThrow(RangeError),
  );

  it.each<[keyof ActivityRanking, unknown]>([
    ['city', 12],
    ['city', ''],
    ['city', ' '],
    ['city', 'x'.repeat(121)],
    ['activity', 'SKIING'],
    ['activity', 'cycling'],
    ['activity', undefined],
    ['forecastDate', '2026-02-30'],
    ['forecastDate', '2026-10-14T00:00:00Z'],
    ['forecastDate', new Date()],
    ['forecastDate', undefined],
    ['score', '80'],
    ['score', null],
    ['score', undefined],
    ['score', -1],
    ['score', 101],
    ['score', NaN],
    ['score', Infinity],
    ['factors', undefined],
    ['factors', null],
    ['factors', []],
    ['factors', { invalid: {} }],
    ['factors', { invalid: [] }],
    ['factors', { invalid: NaN }],
    ['factors', { invalid: Infinity }],
    ['factors', { invalid: undefined }],
    ['weatherUpdatedAt', undefined],
    ['weatherUpdatedAt', '2028-02-28T12:00:00Z'],
    ['weatherUpdatedAt', new Date('invalid')],
    ['calculatedAt', undefined],
    ['calculatedAt', null],
    ['calculatedAt', '2028-02-28T12:00:00Z'],
    ['calculatedAt', new Date('invalid')],
  ])('rejects malformed %s = %p without coercion', (field, value) => {
    expect(() => validateRankings([{ ...ranking(), [field]: value }])).toThrow(
      RangeError,
    );
  });
});
