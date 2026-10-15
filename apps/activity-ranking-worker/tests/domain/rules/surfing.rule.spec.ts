import { Test, TestingModule } from '@nestjs/testing';

import { EvaluationState } from '@libs/models';

import { forecastFixture } from '../../../../city-ranking-test.fixtures';
import { ActivityRankingContext } from '../../../src/domain/activity-ranking-rule';
import { SurfingRule } from '../../../src/domain/rules/surfing.rule';

describe('Surfing rule', () => {
  let moduleRef: TestingModule;
  let rule: SurfingRule;
  const context = (): ActivityRankingContext => ({
    day: forecastFixture().days[0],
    marineStatus: 'AVAILABLE',
  });
  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [SurfingRule],
    }).compile();
    rule = moduleRef.get(SurfingRule);
  });
  afterAll(async () => moduleRef.close());

  it('favors moderate waves, longer periods and light wind', () => {
    const input = context();
    expect(rule.evaluate(input).score).toBe(100);
    expect(
      rule.evaluate({ ...input, day: { ...input.day, waveHeightMaxMeters: 5 } })
        .score,
    ).toBe(0);
    expect(
      rule.evaluate({
        ...input,
        day: { ...input.day, wavePeriodMaxSeconds: 5 },
      }).score,
    ).toBe(50);
    expect(
      rule.evaluate({
        ...input,
        day: { ...input.day, windSpeedMaxKilometersPerHour: 25 },
      }).score,
    ).toBe(70);
  });
  it('gives explicit non-applicability priority over missing observations', () => {
    const input = context();
    expect(
      rule.evaluate({
        day: { ...input.day, waveHeightMaxMeters: null },
        marineStatus: 'NOT_APPLICABLE',
      }),
    ).toMatchObject({
      state: EvaluationState.NOT_APPLICABLE,
      score: null,
      rank: null,
    });
    expect(
      rule.evaluate({ ...input, marineStatus: 'INSUFFICIENT_DATA' }),
    ).toMatchObject({
      state: EvaluationState.INSUFFICIENT_DATA,
      score: null,
    });
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
  it.each([null, '1.5', NaN, Infinity])(
    'rejects invalid marine observations: %s',
    (value) => {
      const input = context();
      expect(
        rule.evaluate({
          ...input,
          day: { ...input.day, waveHeightMaxMeters: value as number },
        }),
      ).toMatchObject({
        state: EvaluationState.INSUFFICIENT_DATA,
        score: null,
      });
    },
  );
});
