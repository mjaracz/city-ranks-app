import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { GraphQLError } from 'graphql';
import { of, throwError } from 'rxjs';
import {
  ACTIVITY_RANKING_WORKER_CLIENT,
  CITY_RANKING_QUERY,
} from '@libs/contracts/message-patterns';
import { CityQueryError } from '@libs/contracts/city-query';
import {
  forecastFixture,
  rankingFixture,
} from '../../../../city-ranking-test.fixtures';
import { CityRankingGatewayService } from '../../../src/services/city-ranking.service';

describe('CityRankingGatewayService', () => {
  let moduleRef: TestingModule;
  let service: CityRankingGatewayService;
  const rankings = {
    send: jest.fn<
      (
        pattern: string,
        data: { city: string },
      ) => import('rxjs').Observable<unknown>
    >(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    moduleRef = await Test.createTestingModule({
      providers: [
        CityRankingGatewayService,
        { provide: ACTIVITY_RANKING_WORKER_CLIENT, useValue: rankings },
      ],
    }).compile();
    service = moduleRef.get(CityRankingGatewayService);
  });

  afterEach(async () => moduleRef.close());

  it('sends a normalized city query and returns the worker ranking', async () => {
    const ranking = rankingFixture(forecastFixture());
    rankings.send.mockReturnValue(of({ status: 'OK', result: ranking }));

    await expect(service.getRanking('  Test   Bay ')).resolves.toEqual(ranking);
    expect(rankings.send).toHaveBeenCalledWith(CITY_RANKING_QUERY, {
      city: 'Test Bay',
    });
  });

  it('returns stable GraphQL error codes for domain failures and malformed worker responses', async () => {
    rankings.send.mockReturnValue(
      of({ status: 'ERROR', code: 'CITY_NOT_FOUND', message: 'Unknown city' }),
    );
    await expect(service.getRanking('Missing')).rejects.toMatchObject({
      message: 'Unknown city',
      extensions: { code: 'CITY_NOT_FOUND' },
    });

    rankings.send.mockReturnValue(of({ status: 'UNKNOWN' }));
    await expect(service.getRanking('Test Bay')).rejects.toMatchObject({
      message: 'Invalid ranking worker response',
      extensions: { code: 'RANKING_UNAVAILABLE' },
    });

    rankings.send.mockReturnValue(throwError(() => new Error('nats detail')));
    await expect(service.getRanking('Test Bay')).rejects.toBeInstanceOf(
      GraphQLError,
    );
  });

  it('rejects invalid city input before contacting the worker', async () => {
    await expect(service.getRanking('  ')).rejects.toBeInstanceOf(GraphQLError);
    expect(rankings.send).not.toHaveBeenCalled();
  });

  it('preserves typed city validation errors as GraphQL extensions', async () => {
    rankings.send.mockReturnValue(
      throwError(() => new CityQueryError('INVALID_CITY', 'City is invalid')),
    );

    await expect(service.getRanking('Test Bay')).rejects.toMatchObject({
      extensions: { code: 'INVALID_CITY' },
    });
  });
});
