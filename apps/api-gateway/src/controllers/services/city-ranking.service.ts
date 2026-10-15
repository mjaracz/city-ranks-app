import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { GraphQLError } from 'graphql';
import { firstValueFrom, timeout } from 'rxjs';
import {
  ACTIVITY_RANKING_WORKER_CLIENT,
  CITY_RANKING_QUERY,
} from '@libs/contracts/message-patterns';
import {
  CityQueryError,
  CityQueryResult,
  normalizeCity,
} from '@libs/contracts/city-query';
import type { CityRanking } from '@libs/models';

@Injectable()
export class CityRankingGatewayService {
  constructor(
    @Inject(ACTIVITY_RANKING_WORKER_CLIENT)
    private readonly rankings: ClientProxy,
  ) {}

  async getRanking(input: string): Promise<CityRanking> {
    try {
      const city = normalizeCity(input);
      const response = await firstValueFrom(
        this.rankings
          .send<CityQueryResult<CityRanking>>(CITY_RANKING_QUERY, { city })
          .pipe(timeout(40_000)),
      );
      if (response?.status === 'ERROR')
        throw new CityQueryError(response.code, response.message);
      if (response?.status !== 'OK')
        throw new CityQueryError(
          'RANKING_UNAVAILABLE',
          'Invalid ranking worker response',
        );
      return response.result;
    } catch (error) {
      if (error instanceof CityQueryError)
        throw new GraphQLError(error.message, {
          extensions: { code: error.code },
        });
      throw new GraphQLError('City ranking is temporarily unavailable', {
        extensions: { code: 'RANKING_UNAVAILABLE' },
      });
    }
  }
}
