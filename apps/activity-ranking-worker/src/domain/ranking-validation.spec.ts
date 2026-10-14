import { forecastFixture } from '../../../city-ranking-test.fixtures';
import { calculateCityRanking } from './ranking-policy';
import { validateCityRanking } from './ranking-validation';

describe('validateCityRanking', () => {
  it('accepts a complete deterministic seven-day ranking', () => {
    const ranking = calculateCityRanking(forecastFixture());
    expect(() => validateCityRanking(ranking)).not.toThrow();
  });

  it('rejects altered ranks, incomplete day windows, and invalid identifiers', () => {
    const alteredRank = calculateCityRanking(forecastFixture());
    alteredRank.days[0].activities[0].rank = 4;
    expect(() => validateCityRanking(alteredRank)).toThrow(
      'Invalid complete city ranking',
    );

    const shortenedWindow = calculateCityRanking(forecastFixture());
    shortenedWindow.windowEndDate = shortenedWindow.windowStartDate;
    expect(() => validateCityRanking(shortenedWindow)).toThrow(
      'Invalid complete city ranking',
    );

    const malformedId = calculateCityRanking(forecastFixture());
    malformedId.id = 'not-a-content-hash';
    expect(() => validateCityRanking(malformedId)).toThrow(
      'Invalid complete city ranking',
    );
  });

  it('rejects incomplete explanatory data rather than storing plausible results', () => {
    const ranking = calculateCityRanking(forecastFixture());
    ranking.days[0].activities[0].explanation = ' ';
    expect(() => validateCityRanking(ranking)).toThrow(
      'Invalid complete city ranking',
    );
  });
});
