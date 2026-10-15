import { Test, TestingModule } from '@nestjs/testing';
import { EvaluationState } from '@libs/models';
import { forecastFixture } from '../../../../city-ranking-test.fixtures';
import { ActivityRankingContext } from '../../../src/domain/activity-ranking-rule';
import { SkiingRule } from '../../../src/domain/rules/skiing.rule';

describe('Skiing rule', () => {
  let moduleRef: TestingModule;
  let rule: SkiingRule;
  const context = (): ActivityRankingContext => ({
    day: {
      ...forecastFixture().days[0],
      temperatureMinCelsius: -10,
      temperatureMaxCelsius: 0,
      snowDepthMaxMeters: 0.3,
    },
    marineStatus: 'AVAILABLE',
  });
  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [SkiingRule],
    }).compile();
    rule = moduleRef.get(SkiingRule);
  });
  afterAll(async () => moduleRef.close());

  it('favors cold weather with snow and reduces suitability with thin snow, wind or heavy snowfall', () => {
    const input = context();
    expect(rule.evaluate(input).score).toBe(100);
    expect(
      rule.evaluate({
        ...input,
        day: { ...input.day, snowDepthMaxMeters: 0.15 },
      }).score,
    ).toBe(50);
    expect(
      rule.evaluate({
        ...input,
        day: { ...input.day, windSpeedMaxKilometersPerHour: 45 },
      }).score,
    ).toBe(50);
    expect(
      rule.evaluate({
        ...input,
        day: { ...input.day, snowfallCentimeters: 35 },
      }).score,
    ).toBe(50);
  });
  it('treats no snow and thunderstorms as ranked zero outcomes', () => {
    const input = context();
    expect(
      rule.evaluate({ ...input, day: { ...input.day, snowDepthMaxMeters: 0 } }),
    ).toMatchObject({
      state: EvaluationState.RANKED,
      score: 0,
      reasonCodes: ['v1.no-snow-cover'],
    });
    expect(
      rule.evaluate({ ...input, day: { ...input.day, weatherCode: 95 } }),
    ).toMatchObject({
      state: EvaluationState.RANKED,
      score: 0,
      reasonCodes: ['v1.thunderstorm'],
    });
  });
  it('does not require observations used only by other activities', () => {
    const input = context();
    expect(
      rule.evaluate({
        ...input,
        day: {
          ...input.day,
          precipitationMillimeters: null,
          waveHeightMaxMeters: null,
        },
      }).score,
    ).toBe(100);
  });
  it.each([null, '0', NaN, Infinity])(
    'keeps invalid snow observations unavailable: %s',
    (value) => {
      const input = context();
      expect(
        rule.evaluate({
          ...input,
          day: { ...input.day, snowDepthMaxMeters: value as number },
        }),
      ).toMatchObject({
        state: EvaluationState.INSUFFICIENT_DATA,
        score: null,
      });
    },
  );
});
