import { validateCityRanking } from '../../src/domain/ranking-validation';
import { validateCityForecast } from '../../src/domain/forecast-validation';
import {
  Activity,
  ActivityEvaluation,
  Completeness,
  EvaluationState,
  addCalendarDays,
  localDate,
} from '../../../../libs/models/src';
import { forecastFixture } from '../../../city-ranking-test.fixtures';
import {
  calculateCityRanking,
  evaluateActivities,
  rankDay,
} from '../../src/domain/ranking-policy';

const evaluations = (scores: number[]): ActivityEvaluation[] =>
  Object.values(Activity).map((activity, i) => ({
    activity,
    score: scores[i],
    rank: null,
    state: EvaluationState.RANKED,
    reasonCodes: ['v1.test'],
    explanation: 'Test score',
  }));

describe('Daily weather suitability ranking', () => {
  it('returns seven chronological dates with each activity exactly once, explanatory metadata and finite scores', () => {
    const ranking = calculateCityRanking(forecastFixture());
    expect(ranking.days).toHaveLength(7);
    expect(ranking.completeness).toBe(Completeness.COMPLETE);
    expect(ranking.policyVersion).toBe('weather-suitability-v1');
    for (const day of ranking.days) {
      expect(new Set(day.activities.map((item) => item.activity))).toEqual(
        new Set(Object.values(Activity)),
      );
      expect(day.activities.map((item) => item.rank)).toEqual([1, 1, 3, 4]);
      for (const item of day.activities) {
        expect(item.score).toBeGreaterThanOrEqual(0);
        expect(item.score).toBeLessThanOrEqual(100);
        expect(item.reasonCodes.length).toBeGreaterThan(0);
        expect(item.explanation).not.toBe('');
      }
    }
  });
  it('rounds half up before comparison, preserves ties and uses competition ranks', () => {
    const day = rankDay(
      '2026-10-14',
      evaluations([90.004, 90.001, 70, 10.075]),
    );
    expect(day.activities.map((item) => item.score)).toEqual([
      90, 90, 70, 10.08,
    ]);
    expect(day.activities.map((item) => item.rank)).toEqual([1, 1, 3, 4]);
    expect(
      rankDay('2026-10-14', evaluations([10, 10, 10, 10])).activities.map(
        (item) => item.rank,
      ),
    ).toEqual([1, 1, 1, 1]);
  });
  it('ranks independently for each day', () => {
    const forecast = forecastFixture();
    const original = calculateCityRanking(forecast);
    forecast.days[6].precipitationMillimeters = 50;
    expect(calculateCityRanking(forecast).days[0]).toEqual(original.days[0]);
    expect(calculateCityRanking(forecast).days[6]).not.toEqual(
      original.days[6],
    );
  });
  it('distinguishes zero suitability, missing marine observations and explicit non-applicability', () => {
    const forecast = forecastFixture();
    let result = rankDay(
      forecast.days[0].date,
      evaluateActivities(forecast.days[0], 'INSUFFICIENT_DATA'),
    );
    expect(result.completeness).toBe(Completeness.PARTIAL);
    expect(
      result.activities.find((item) => item.activity === Activity.SKIING),
    ).toMatchObject({ score: 0, state: EvaluationState.RANKED });
    expect(
      result.activities.find((item) => item.activity === Activity.SURFING),
    ).toMatchObject({
      score: null,
      rank: null,
      state: EvaluationState.INSUFFICIENT_DATA,
    });
    result = rankDay(
      forecast.days[0].date,
      evaluateActivities(forecast.days[0], 'NOT_APPLICABLE'),
    );
    expect(
      result.activities.find((item) => item.activity === Activity.SURFING),
    ).toMatchObject({
      score: null,
      rank: null,
      state: EvaluationState.NOT_APPLICABLE,
    });
  });
  it('favors indoor sightseeing in rain, skiing with cold snow cover, and surfing in moderate waves', () => {
    const day = forecastFixture().days[0];
    const score = (activity: Activity, input = day) =>
      evaluateActivities(input, 'AVAILABLE').find(
        (item) => item.activity === activity,
      )!.score;
    expect(
      score(Activity.INDOOR_SIGHTSEEING, {
        ...day,
        precipitationMillimeters: 30,
      }),
    ).toBeGreaterThan(
      score(Activity.OUTDOOR_SIGHTSEEING, {
        ...day,
        precipitationMillimeters: 30,
      })!,
    );
    expect(
      score(Activity.SKIING, {
        ...day,
        temperatureMinCelsius: -10,
        temperatureMaxCelsius: 0,
        snowDepthMaxMeters: 0.3,
      }),
    ).toBe(100);
    expect(score(Activity.SURFING)).toBe(100);
    expect(score(Activity.SURFING, { ...day, waveHeightMaxMeters: 5 })).toBe(0);
    const thunderstorm = evaluateActivities(
      { ...day, weatherCode: 95 },
      'AVAILABLE',
    );
    expect(
      thunderstorm
        .filter((item) => item.activity !== Activity.INDOOR_SIGHTSEEING)
        .map((item) => item.score),
    ).toEqual([0, 0, 0]);
  });
  it('preserves 28 unavailable evaluations when all observations are missing', () => {
    const forecast = forecastFixture();
    forecast.days = forecast.days.map(
      (day) =>
        Object.fromEntries(
          Object.entries(day).map(([key, value]) => [
            key,
            key === 'date' ? value : null,
          ]),
        ) as typeof day,
    );
    const result = calculateCityRanking(forecast);
    expect(result.completeness).toBe(Completeness.UNAVAILABLE);
    expect(result.days.flatMap((day) => day.activities)).toHaveLength(28);
    expect(
      result.days.every((day) =>
        day.activities.every(
          (item) => item.rank === null && item.score === null,
        ),
      ),
    ).toBe(true);
  });
  it('rejects invalid or duplicate evaluations rather than producing plausible ranks', () => {
    expect(() =>
      rankDay('2026-10-14', evaluations([NaN, 20, 30, 40])),
    ).toThrow();
    expect(() =>
      rankDay('2026-10-14', evaluations([-1, 20, 30, 40])),
    ).toThrow();
    const duplicate = evaluations([1, 2, 3, 4]);
    duplicate[1].activity = duplicate[0].activity;
    expect(() => rankDay('2026-10-14', duplicate)).toThrow();
  });
  it('uses city-local dates and calendar arithmetic across DST and year boundaries', () => {
    expect(localDate(new Date('2026-10-14T23:30:00Z'), 'Europe/Warsaw')).toBe(
      '2026-10-15',
    );
    expect(
      localDate(new Date('2026-10-14T01:30:00Z'), 'America/Los_Angeles'),
    ).toBe('2026-10-13');
    expect(addCalendarDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addCalendarDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addCalendarDays('2026-12-29', 6)).toBe('2027-01-04');
  });
  it('validates JSONB results by values independently of object-key ordering', () => {
    const ranking = calculateCityRanking(forecastFixture());
    const reorder = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(reorder)
        : value && typeof value === 'object'
          ? Object.fromEntries(
              Object.entries(value)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, item]) => [key, reorder(item)]),
            )
          : value;
    expect(() =>
      validateCityRanking(reorder(ranking) as typeof ranking),
    ).not.toThrow();
    expect(() => validateCityRanking({ ...ranking, days: [] })).toThrow();
    ranking.days[0].activities[0].rank = 4;
    expect(() => validateCityRanking(ranking)).toThrow();
  });
  it('rejects malformed worker snapshots, unknown weather codes and non-local date windows', () => {
    const forecast = forecastFixture();
    expect(() => validateCityForecast(forecast)).not.toThrow();
    expect(() =>
      validateCityForecast({
        ...forecast,
        city: { ...forecast.city, timezone: undefined },
      }),
    ).toThrow();
    forecast.days[0].weatherCode = 98;
    expect(() => validateCityForecast(forecast)).toThrow();
    forecast.days[0].weatherCode = 0;
    forecast.days[0].date = addCalendarDays(forecast.days[0].date, -1);
    expect(() => validateCityForecast(forecast)).toThrow();
  });
});
