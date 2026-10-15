import { Activity, Completeness, EvaluationState } from '@libs/models';
import {
  forecastFixture,
  rankingFixture,
} from '../../../city-ranking-test.fixtures';
import { rankDay } from '../../src/domain/daily-ranking';
import { validateCityRanking } from '../../src/domain/ranking-validation';

describe('Persisted ranking consistency', () => {
  it('accepts competition ties and valid zero suitability scores', () => {
    const ranking = rankingFixture(forecastFixture());
    expect(ranking.days[0].activities.map((item) => item.rank)).toEqual([
      1, 1, 3, 4,
    ]);
    expect(() => validateCityRanking(ranking)).not.toThrow();

    ranking.days = ranking.days.map((day) =>
      rankDay(
        day.date,
        day.activities.map((item) => ({ ...item, score: 0 })),
      ),
    );
    expect(ranking.days[0].activities.map((item) => item.rank)).toEqual([
      1, 1, 1, 1,
    ]);
    expect(() => validateCityRanking(ranking)).not.toThrow();
  });

  it('rejects a dense rank where competition ranking requires a gap after ties', () => {
    const ranking = rankingFixture(forecastFixture());
    ranking.days[0].activities[2].rank = 2;
    expect(() => validateCityRanking(ranking)).toThrow(RangeError);
  });

  it('rejects saved scores that differ from the rounded ranking policy result', () => {
    const ranking = rankingFixture(forecastFixture());
    ranking.days[0].activities.find(
      (item) => item.activity === Activity.INDOOR_SIGHTSEEING,
    )!.score = 40.001;
    expect(() => validateCityRanking(ranking)).toThrow(RangeError);
  });

  it('accepts partial and unavailable results while retaining null score and rank', () => {
    const forecast = forecastFixture();
    forecast.marineStatus = 'INSUFFICIENT_DATA';
    const partial = rankingFixture(forecast);
    expect(partial.completeness).toBe(Completeness.PARTIAL);
    expect(() => validateCityRanking(partial)).not.toThrow();

    forecast.days.forEach((day) => {
      day.temperatureMinCelsius = null;
    });
    const unavailable = rankingFixture(forecast);
    expect(unavailable.completeness).toBe(Completeness.UNAVAILABLE);
    expect(() => validateCityRanking(unavailable)).not.toThrow();
  });

  it('accepts explicit non-applicability as an unranked activity', () => {
    const forecast = forecastFixture();
    forecast.marineStatus = 'NOT_APPLICABLE';
    const ranking = rankingFixture(forecast);
    expect(
      ranking.days[0].activities.find(
        (item) => item.activity === Activity.SURFING,
      ),
    ).toMatchObject({
      state: EvaluationState.NOT_APPLICABLE,
      score: null,
      rank: null,
    });
    expect(() => validateCityRanking(ranking)).not.toThrow();
  });

  it.each(['score', 'rank'] as const)(
    'rejects an unavailable activity with a non-null %s',
    (field) => {
      const forecast = forecastFixture();
      forecast.marineStatus = 'INSUFFICIENT_DATA';
      const ranking = rankingFixture(forecast);
      ranking.days[0].activities.find(
        (item) => item.activity === Activity.SURFING,
      )![field] = 1;
      expect(() => validateCityRanking(ranking)).toThrow(RangeError);
    },
  );

  it.each(['score', 'rank'] as const)(
    'rejects a ranked activity with a null %s',
    (field) => {
      const ranking = rankingFixture(forecastFixture());
      ranking.days[0].activities[0][field] = null;
      expect(() => validateCityRanking(ranking)).toThrow(RangeError);
    },
  );

  it('requires all four supported activities exactly once in their saved ranking order', () => {
    const duplicate = rankingFixture(forecastFixture());
    duplicate.days[0].activities[1].activity =
      duplicate.days[0].activities[0].activity;
    expect(() => validateCityRanking(duplicate)).toThrow(RangeError);

    const missing = rankingFixture(forecastFixture());
    missing.days[0].activities.pop();
    expect(() => validateCityRanking(missing)).toThrow(RangeError);

    const reordered = rankingFixture(forecastFixture());
    reordered.days[0].activities.reverse();
    expect(() => validateCityRanking(reordered)).toThrow(RangeError);
  });

  it('rejects completeness labels that disagree with the daily and overall evaluations', () => {
    const ranking = rankingFixture(forecastFixture());
    ranking.days[0].completeness = Completeness.PARTIAL;
    expect(() => validateCityRanking(ranking)).toThrow(RangeError);
    ranking.days[0].completeness = Completeness.COMPLETE;
    ranking.completeness = Completeness.UNAVAILABLE;
    expect(() => validateCityRanking(ranking)).toThrow(RangeError);
  });

  it('rejects duplicated, reordered or incomplete date windows', () => {
    const duplicate = rankingFixture(forecastFixture());
    duplicate.days[1].date = duplicate.days[0].date;
    expect(() => validateCityRanking(duplicate)).toThrow(RangeError);

    const reordered = rankingFixture(forecastFixture());
    reordered.days.reverse();
    expect(() => validateCityRanking(reordered)).toThrow(RangeError);

    const incomplete = rankingFixture(forecastFixture());
    incomplete.days.pop();
    expect(() => validateCityRanking(incomplete)).toThrow(RangeError);
  });

  it('accepts historical windows across year boundaries independently of current freshness', () => {
    const now = new Date('2000-12-29T12:00:00Z');
    const ranking = rankingFixture(forecastFixture(now), now);
    expect(ranking.windowEndDate).toBe('2001-01-04');
    expect(() => validateCityRanking(ranking)).not.toThrow();
  });
});
