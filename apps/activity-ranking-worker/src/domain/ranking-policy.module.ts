import { RankingFreshnessPolicy } from './ranking-freshness.policy';
import { Module } from '@nestjs/common';
import {
  ACTIVITY_RANKING_RULES,
  ActivityRankingRule,
} from './activity-ranking-rule';
import { RankingPolicy } from './ranking-policy';
import { IndoorSightseeingRule } from './rules/indoor-sightseeing.rule';
import { OutdoorSightseeingRule } from './rules/outdoor-sightseeing.rule';
import { SkiingRule } from './rules/skiing.rule';
import { SurfingRule } from './rules/surfing.rule';

@Module({
  providers: [
    SkiingRule,
    SurfingRule,
    OutdoorSightseeingRule,
    IndoorSightseeingRule,
    {
      provide: ACTIVITY_RANKING_RULES,
      useFactory: (
        skiing: SkiingRule,
        surfing: SurfingRule,
        outdoor: OutdoorSightseeingRule,
        indoor: IndoorSightseeingRule,
      ): readonly ActivityRankingRule[] => [skiing, surfing, outdoor, indoor],
      inject: [
        SkiingRule,
        SurfingRule,
        OutdoorSightseeingRule,
        IndoorSightseeingRule,
      ],
    },
    RankingPolicy,
    RankingFreshnessPolicy,
  ],
  exports: [RankingPolicy, RankingFreshnessPolicy],
})
export class RankingPolicyModule {}
