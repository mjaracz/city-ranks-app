import { Test } from '@nestjs/testing';

import {
  forecastFixture,
  rankingFixture,
} from '../../../city-ranking-test.fixtures';
import { RankingFreshnessPolicy } from '../../src/domain/ranking-freshness.policy';

describe('RankingFreshnessPolicy', () => {
  it('requires the current local city date instead of the UTC date', async () => {
    const module = await Test.createTestingModule({
      providers: [RankingFreshnessPolicy],
    }).compile();
    const policy = module.get(RankingFreshnessPolicy);
    const now = new Date('2026-10-14T23:30:00Z');
    const ranking = rankingFixture(forecastFixture(now), now);
    expect(ranking.windowStartDate).toBe('2026-10-15');
    expect(policy.isCurrentWindow(ranking, now)).toBe(true);
    expect(
      policy.isCurrentWindow(
        { ...ranking, windowStartDate: '2026-10-14' },
        now,
      ),
    ).toBe(false);
    expect(policy.isCurrentWindow(null, now)).toBe(false);
    await module.close();
  });
});
