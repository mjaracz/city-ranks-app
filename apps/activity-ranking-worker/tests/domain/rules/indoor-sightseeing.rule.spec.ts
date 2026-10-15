import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';

import { Activity, EvaluationState } from '@libs/models';

import { forecastFixture } from '../../../../city-ranking-test.fixtures';
import {
  missingEvaluation,
  scoredEvaluation,
} from '../../../src/domain/ranking-score';
import { IndoorSightseeingRule } from '../../../src/domain/rules/indoor-sightseeing.rule';
import { OutdoorSightseeingRule } from '../../../src/domain/rules/outdoor-sightseeing.rule';

describe('Indoor sightseeing rule', () => {
  let moduleRef: TestingModule;
  let rule: IndoorSightseeingRule;
  const outdoor = { evaluate: jest.fn<OutdoorSightseeingRule['evaluate']>() };
  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        IndoorSightseeingRule,
        { provide: OutdoorSightseeingRule, useValue: outdoor },
      ],
    }).compile();
    rule = moduleRef.get(IndoorSightseeingRule);
  });
  beforeEach(() => outdoor.evaluate.mockReset());
  afterAll(async () => moduleRef.close());

  it.each([
    [100, 40],
    [50, 70],
    [0, 100],
  ])(
    'uses the indoor baseline and favors worsening outdoor weather (%s to %s)',
    (outside, inside) => {
      outdoor.evaluate.mockReturnValue(
        scoredEvaluation(Activity.OUTDOOR_SIGHTSEEING, outside, 'test', 'Test'),
      );
      const context = {
        day: forecastFixture().days[0],
        marineStatus: 'AVAILABLE' as const,
      };
      expect(rule.evaluate(context).score).toBe(inside);
      expect(outdoor.evaluate).toHaveBeenCalledWith(context);
    },
  );
  it('keeps indoor suitability unavailable when outdoor observations are missing', () => {
    outdoor.evaluate.mockReturnValue(
      missingEvaluation(Activity.OUTDOOR_SIGHTSEEING),
    );
    expect(
      rule.evaluate({
        day: forecastFixture().days[0],
        marineStatus: 'AVAILABLE',
      }),
    ).toMatchObject({
      activity: Activity.INDOOR_SIGHTSEEING,
      state: EvaluationState.INSUFFICIENT_DATA,
      score: null,
    });
  });
});
