import {
  forecastFixture,
  rankingFixture,
} from '../../../city-ranking-test.fixtures';
import { validateCityRanking } from '../../src/domain/ranking-validation';

describe('City ranking field contract', () => {
  it('accepts a plain JSON result without mutating the persisted payload', () => {
    const payload = JSON.parse(
      JSON.stringify(rankingFixture(forecastFixture())),
    );
    const original = structuredClone(payload);

    expect(() => validateCityRanking(payload)).not.toThrow();
    expect(payload).toEqual(original);
  });

  it('accepts a missing region represented explicitly as null', () => {
    const ranking = rankingFixture(forecastFixture());
    ranking.city.region = null;
    expect(() => validateCityRanking(ranking)).not.toThrow();
  });

  it.each<[string, unknown]>([
    ['id', 'not-a-content-hash'],
    ['policyVersion', 1],
    ['policyVersion', '   '],
    ['forecastSnapshotId', {}],
    ['completeness', 'ALL'],
    ['weatherFetchedAt', 1],
    ['weatherFetchedAt', 'invalid'],
    ['marineFetchedAt', 123],
    ['marineFetchedAt', undefined],
    ['freshUntil', undefined],
    ['computedAt', new Date()],
    ['windowStartDate', '2026-02-30'],
    ['windowEndDate', 20261021],
    ['city', null],
    ['city', []],
    ['city.id', 1],
    ['city.name', false],
    ['city.name', '   '],
    ['city.countryCode', 'pl'],
    ['city.country', []],
    ['city.region', 1],
    ['city.latitude', '54.5'],
    ['city.latitude', 91],
    ['city.longitude', -181],
    ['city.timezone', 'Unknown/Timezone'],
    ['days.0.date', '2026-02-30'],
    ['days.0.completeness', 'ALL'],
    ['days.0.activities.0.activity', 'CYCLING'],
    ['days.0.activities.0.state', 'UNKNOWN'],
    ['days.0.activities.0.score', '100'],
    ['days.0.activities.0.score', NaN],
    ['days.0.activities.0.score', Infinity],
    ['days.0.activities.0.score', -1],
    ['days.0.activities.0.score', 101],
    ['days.0.activities.0.rank', '1'],
    ['days.0.activities.0.rank', 1.5],
    ['days.0.activities.0.rank', 0],
    ['days.0.activities.0.rank', 5],
    ['days.0.activities.0.reasonCodes', 'reason'],
    ['days.0.activities.0.reasonCodes', []],
    ['days.0.activities.0.reasonCodes', [null]],
    ['days.0.activities.0.reasonCodes', ['   ']],
    ['days.0.activities.0.reasonCodes', [1]],
    ['days.0.activities.0.explanation', 12],
    ['days.0.activities.0.explanation', '   '],
  ])(
    'rejects invalid field %s = %p without coercing its type',
    (path, value) => {
      const ranking = rankingFixture(forecastFixture());
      const keys = path.split('.');
      const target = keys
        .slice(0, -1)
        .reduce((object, key) => object[key], ranking as Record<string, any>);
      target[keys[keys.length - 1]] = value;

      expect(() => validateCityRanking(ranking)).toThrow(
        'Invalid complete city ranking',
      );
    },
  );
});
