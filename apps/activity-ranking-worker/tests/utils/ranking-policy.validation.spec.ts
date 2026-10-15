import {
  forecastFixture,
  rankingFixture,
} from '../../../city-ranking-test.fixtures';
import { OutdoorRankingConditionsDto } from '../../src/dto/ranking-conditions.dto';
import {
  toValidatedRankingInput,
  validateRankingEvaluations,
  validateRankingForecast,
} from '../../src/utils/ranking-policy.validation';

describe('Ranking policy validation', () => {
  it('keeps numeric zero and excludes unrelated observations without coercion', () => {
    const source = {
      ...forecastFixture().days[0],
      weatherCode: 0,
      unrelated: true,
    };
    const result = toValidatedRankingInput(OutdoorRankingConditionsDto, source);
    expect(result?.weatherCode).toBe(0);
    expect(result).not.toHaveProperty('unrelated');
    expect(source).toHaveProperty('unrelated', true);
    expect(
      toValidatedRankingInput(OutdoorRankingConditionsDto, {
        ...source,
        weatherCode: '0',
      }),
    ).toBeNull();
  });
  it.each([null, undefined, [], 'invalid', 1])(
    'rejects malformed input: %s',
    (input) => {
      expect(
        toValidatedRankingInput(OutdoorRankingConditionsDto, input),
      ).toBeNull();
    },
  );
  it('rejects invalid forecast windows and accepts complete windows', () => {
    expect(() => validateRankingForecast(forecastFixture())).not.toThrow();
    expect(() =>
      validateRankingForecast({ ...forecastFixture(), days: [] }),
    ).toThrow(RangeError);
  });
  it('validates activity collections without changing the supplied results', () => {
    const evaluations = rankingFixture().days[0].activities;
    const before = structuredClone(evaluations);
    expect(() => validateRankingEvaluations(evaluations)).not.toThrow();
    expect(evaluations).toEqual(before);
    expect(() => validateRankingEvaluations(evaluations.slice(1))).toThrow(
      RangeError,
    );
  });
});
