import type { CityRanking } from '../../../libs/models/src';

export abstract class CityRankingRepository {
  abstract findById(id: string): Promise<CityRanking | null>;
  abstract findFresh(
    queryKey: string,
    policyVersion: string,
  ): Promise<CityRanking | null>;
  abstract save(queryKey: string, ranking: CityRanking): Promise<void>;
}
