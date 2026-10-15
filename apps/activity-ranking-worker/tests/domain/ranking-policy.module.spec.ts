import { Test, TestingModule } from '@nestjs/testing';

import { Activity, Completeness } from '@libs/models';

import { forecastFixture } from '../../../city-ranking-test.fixtures';
import { RankingPolicy } from '../../src/domain/ranking-policy';
import { RankingPolicyModule } from '../../src/domain/ranking-policy.module';

describe('RankingPolicyModule', () => {
  let moduleRef: TestingModule;
  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [RankingPolicyModule],
    }).compile();
  });
  afterAll(async () => moduleRef.close());

  it('provides a policy covering the four activities on each forecast day', () => {
    const policy = moduleRef.get(RankingPolicy);
    const result = policy.calculate(forecastFixture());
    expect(result.completeness).toBe(Completeness.COMPLETE);
    expect(result.days).toHaveLength(7);
    for (const day of result.days) {
      expect(new Set(day.activities.map((item) => item.activity))).toEqual(
        new Set(Object.values(Activity)),
      );
    }
  });
});
