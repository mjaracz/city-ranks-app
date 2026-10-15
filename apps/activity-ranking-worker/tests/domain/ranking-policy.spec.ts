import { Test, TestingModule } from '@nestjs/testing';

import {
  Activity,
  ActivityEvaluation,
  addCalendarDays,
  Completeness,
  EvaluationState,
  localDate,
} from '@libs/models';

import { forecastFixture } from '../../../city-ranking-test.fixtures';
import { rankDay } from '../../src/domain/daily-ranking';
import { RankingPolicy } from '../../src/domain/ranking-policy';
import { RankingPolicyModule } from '../../src/domain/ranking-policy.module';
import { validateCityRanking } from '../../src/domain/ranking-validation';

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
  let moduleRef: TestingModule;
  let policy: RankingPolicy;
  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [RankingPolicyModule],
    }).compile();
    policy = moduleRef.get(RankingPolicy);
  });
  afterAll(async () => moduleRef.close());

  it('returns seven chronological dates with each activity exactly once, explanatory metadata and finite scores', () => {
    const ranking = policy.calculate(forecastFixture());
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
    const original = policy.calculate(forecast);
    forecast.days[6].precipitationMillimeters = 50;
    expect(policy.calculate(forecast).days[0]).toEqual(original.days[0]);
    expect(policy.calculate(forecast).days[6]).not.toEqual(original.days[6]);
  });
  it('distinguishes zero suitability, missing marine observations and explicit non-applicability', () => {
    const forecast = forecastFixture();
    let result = rankDay(
      forecast.days[0].date,
      policy.evaluateActivities(forecast.days[0], 'INSUFFICIENT_DATA'),
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
      policy.evaluateActivities(forecast.days[0], 'NOT_APPLICABLE'),
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
      policy
        .evaluateActivities(input, 'AVAILABLE')
        .find((item) => item.activity === activity)!.score;
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
    const thunderstorm = policy.evaluateActivities(
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
    const result = policy.calculate(forecast);
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
    const ranking = policy.calculate(forecastFixture());
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
});

describe('RankingPolicy injection and call context', () => {
  it('uses injected activity rules and their current forecast context', async () => {
    const { ACTIVITY_RANKING_RULES } =
      await import('../../src/domain/activity-ranking-rule');
    const forecast = forecastFixture();
    const contexts: unknown[] = [];
    const rules = Object.values(Activity).map((activity, index) => ({
      activity,
      evaluate: (context: unknown): ActivityEvaluation => {
        contexts.push(context);
        return {
          activity,
          state: EvaluationState.RANKED,
          score: 90 - index * 10,
          rank: null,
          reasonCodes: ['v1.injected'],
          explanation: 'Injected rule',
        };
      },
    }));
    const moduleRef = await Test.createTestingModule({
      providers: [
        RankingPolicy,
        { provide: ACTIVITY_RANKING_RULES, useValue: rules },
      ],
    }).compile();
    try {
      const policy = moduleRef.get(RankingPolicy);
      const result = policy.calculate(forecast);
      expect(result.days[0].activities.map((item) => item.score)).toEqual([
        90, 80, 70, 60,
      ]);
      expect(contexts).toHaveLength(28);
      expect(contexts[0]).toEqual({
        day: forecast.days[0],
        marineStatus: forecast.marineStatus,
      });
      expect(contexts[27]).toEqual({
        day: forecast.days[6],
        marineStatus: forecast.marineStatus,
      });
    } finally {
      await moduleRef.close();
    }
  });
  it('keeps sequential computations independent and preserves forecast identity and provenance', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [RankingPolicyModule],
    }).compile();
    try {
      const policy = moduleRef.get(RankingPolicy);
      const forecast = forecastFixture(new Date('2026-10-14T08:00:00Z'));
      const before = structuredClone(forecast);
      const computedAt = new Date('2026-10-14T08:01:00Z');
      const original = policy.calculate(forecast, computedAt);
      const other = {
        ...structuredClone(forecast),
        snapshotId: 'other',
        marineStatus: 'NOT_APPLICABLE' as const,
      };
      const next = policy.calculate(other, computedAt);
      expect(next.id).not.toBe(original.id);
      expect(
        next.days[0].activities.find(
          (item) => item.activity === Activity.SURFING,
        )?.state,
      ).toBe(EvaluationState.NOT_APPLICABLE);
      expect(policy.calculate(forecast, computedAt)).toEqual(original);
      expect(forecast).toEqual(before);
      expect(
        policy.calculate(forecast, new Date('2026-10-14T08:02:00Z')).id,
      ).toBe(original.id);
      expect(original).toMatchObject({
        forecastSnapshotId: forecast.snapshotId,
        weatherFetchedAt: forecast.weatherFetchedAt,
        marineFetchedAt: forecast.marineFetchedAt,
        freshUntil: forecast.freshUntil,
        computedAt: computedAt.toISOString(),
      });
    } finally {
      await moduleRef.close();
    }
  });
});
