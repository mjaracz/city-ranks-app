export type ActivityType =
  'skiing' | 'surfing' | 'outdoor-sightseeing' | 'indoor-sightseeing';

export type ActivityFactor = Record<string, number | string | boolean | null>;

export interface ActivityRanking {
  city: string;
  activity: ActivityType;
  forecastDate: string;
  score: number;
  factors: ActivityFactor;
  weatherUpdatedAt: Date | null;
  calculatedAt: Date;
}

export abstract class ActivityRankingRepository {
  abstract saveRankings(rankings: readonly ActivityRanking[]): Promise<void>;

  abstract findByCityAndPeriod(
    city: string,
    from: string,
    until: string,
  ): Promise<ActivityRanking[]>;
}
