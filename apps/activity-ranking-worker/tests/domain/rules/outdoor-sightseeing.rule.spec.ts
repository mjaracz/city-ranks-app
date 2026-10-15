import { Test, TestingModule } from '@nestjs/testing';
import { EvaluationState } from '@libs/models';
import { forecastFixture } from '../../../../city-ranking-test.fixtures';
import { ActivityRankingContext } from '../../../src/domain/activity-ranking-rule';
import { OutdoorSightseeingRule } from '../../../src/domain/rules/outdoor-sightseeing.rule';

describe('Outdoor sightseeing rule', () => {
  let moduleRef: TestingModule;
  let rule: OutdoorSightseeingRule;
  const context = (): ActivityRankingContext => ({
    day: forecastFixture().days[0],
    marineStatus: 'AVAILABLE',
  });
  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [OutdoorSightseeingRule],
    }).compile();
    rule = moduleRef.get(OutdoorSightseeingRule);
  });
  afterAll(async () => moduleRef.close());

  it('prefers mild, dry weather and lowers suitability for rain, cold and wind', () => {
    const input = context();
    expect(rule.evaluate(input).score).toBe(100);
    expect(
      rule.evaluate({
        ...input,
        day: { ...input.day, precipitationMillimeters: 5 },
      }).score,
    ).toBe(75);
    expect(
      rule.evaluate({
        ...input,
        day: {
          ...input.day,
          temperatureMinCelsius: 5,
          temperatureMaxCelsius: 15,
        },
      }).score,
    ).toBe(70);
    expect(
      rule.evaluate({
        ...input,
        day: { ...input.day, windSpeedMaxKilometersPerHour: 35 },
      }).score,
    ).toBe(70);
  });
  it('assigns ranked zero in a thunderstorm', () => {
    const input = context();
    expect(
      rule.evaluate({ ...input, day: { ...input.day, weatherCode: 95 } }),
    ).toMatchObject({
      state: EvaluationState.RANKED,
      score: 0,
      reasonCodes: ['v1.thunderstorm'],
    });
  });
  it.each([null, undefined, '0', NaN, Infinity])(
    'keeps invalid observations unavailable: %s',
    (value) => {
      const input = context();
      expect(
        rule.evaluate({
          ...input,
          day: { ...input.day, precipitationMillimeters: value as number },
        }),
      ).toMatchObject({
        state: EvaluationState.INSUFFICIENT_DATA,
        score: null,
        rank: null,
      });
    },
  );
});
