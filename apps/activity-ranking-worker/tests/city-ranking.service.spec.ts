import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { Observable, of, throwError } from 'rxjs';

import { CityQueryError } from '@libs/contracts/city-query';
import {
  WEATHER_CITY_FORECAST_QUERY,
  WEATHER_WORKER_CLIENT,
} from '@libs/contracts/message-patterns';
import { JetStreamEventStore } from '@libs/messaging/jetstream-event-store';
import { CityForecast } from '@libs/models';

import {
  forecastFixture,
  rankingFixture,
} from '../../city-ranking-test.fixtures';
import { CityRankingRepository } from '../src/city-ranking.repository';
import { RankingFreshnessPolicy } from '../src/domain/ranking-freshness.policy';
import { RankingPolicy } from '../src/domain/ranking-policy';
import { CityRankingService } from '../src/services/city-ranking.service';

describe('CityRankingService', () => {
  let moduleRef: TestingModule;
  let service: CityRankingService;
  const repository = {
    findById: jest.fn<CityRankingRepository['findById']>(),
    findFresh: jest.fn<CityRankingRepository['findFresh']>(),
    save: jest.fn<CityRankingRepository['save']>(),
  };
  const weather = {
    send: jest.fn<
      (
        pattern: string,
        data: { city: string },
      ) => import('rxjs').Observable<unknown>
    >(),
  };
  const policy = {
    version: 'injected-policy-version',
    calculate: jest.fn<RankingPolicy['calculate']>(),
  };
  const eventStore = { append: jest.fn<JetStreamEventStore['append']>() };

  beforeEach(async () => {
    jest.clearAllMocks();
    policy.calculate.mockImplementation(rankingFixture);
    repository.findFresh.mockResolvedValue(null);
    repository.findById.mockResolvedValue(null);
    repository.save.mockResolvedValue(undefined);
    eventStore.append.mockResolvedValue(undefined);
    weather.send.mockReturnValue(
      of({ status: 'OK', result: forecastFixture() }),
    );
    moduleRef = await Test.createTestingModule({
      providers: [
        CityRankingService,
        RankingFreshnessPolicy,
        { provide: RankingPolicy, useValue: policy },
        { provide: CityRankingRepository, useValue: repository },
        { provide: WEATHER_WORKER_CLIENT, useValue: weather },
        { provide: JetStreamEventStore, useValue: eventStore },
      ],
    }).compile();
    service = moduleRef.get(CityRankingService);
  });

  afterEach(async () => moduleRef.close());

  it('returns a fresh ranking and persists its event and query result', async () => {
    const ranking = await service.getRanking('  Test   Bay ');

    expect(policy.calculate).toHaveBeenCalledWith(
      expect.objectContaining({
        city: expect.objectContaining({ name: 'Test Bay' }),
      }),
    );
    expect(repository.findFresh).toHaveBeenCalledWith(
      'test bay',
      policy.version,
    );
    expect(ranking.city.name).toBe('Test Bay');
    expect(ranking.days).toHaveLength(7);
    expect(weather.send).toHaveBeenCalledWith(WEATHER_CITY_FORECAST_QUERY, {
      city: 'Test Bay',
    });
    expect(eventStore.append).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: `${ranking.id}:city-ranking-computed`,
        eventType: 'city-ranking-computed',
        payload: ranking,
      }),
    );
    expect(repository.save).toHaveBeenCalledWith('test bay', ranking);
    expect(eventStore.append.mock.invocationCallOrder[0]).toBeLessThan(
      repository.save.mock.invocationCallOrder[0],
    );
  });

  it('serves a fresh same-day ranking without calling workers or writing events', async () => {
    const cached = rankingFixture(forecastFixture());
    repository.findFresh.mockResolvedValue(cached);

    await expect(service.getRanking('test bay')).resolves.toEqual(cached);

    expect(weather.send).not.toHaveBeenCalled();
    expect(policy.calculate).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
    expect(eventStore.append).not.toHaveBeenCalled();
  });

  it('refreshes stale windows and explicitly requested refreshes', async () => {
    const stale = {
      ...rankingFixture(forecastFixture()),
      windowStartDate: '2000-01-01',
    };
    repository.findFresh.mockResolvedValue(stale);

    await service.getRanking('test bay');
    expect(weather.send).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();
    repository.findFresh.mockResolvedValue(rankingFixture(forecastFixture()));
    repository.findById.mockResolvedValue(null);
    weather.send.mockReturnValue(
      of({ status: 'OK', result: forecastFixture() }),
    );
    await service.getRanking('test bay', true);
    expect(weather.send).toHaveBeenCalledTimes(1);
  });

  it('reuses an identical immutable result without emitting a duplicate event', async () => {
    const existing = rankingFixture(forecastFixture());
    repository.findById.mockResolvedValue(existing);

    await expect(service.getRanking('test bay')).resolves.toEqual(existing);

    expect(repository.save).toHaveBeenCalledWith('test bay', existing);
    expect(eventStore.append).not.toHaveBeenCalled();
  });

  it('coalesces concurrent requests for the same normalized city', async () => {
    let release!: (value: { status: 'OK'; result: CityForecast }) => void;
    weather.send.mockReturnValue(
      new Observable((subscriber) => {
        release = (value) => {
          subscriber.next(value);
          subscriber.complete();
        };
      }),
    );

    const first = service.getRanking('Test Bay');
    const second = service.getRanking(' test   bay ');
    await Promise.resolve();
    release({ status: 'OK', result: forecastFixture() });

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({
        city: expect.objectContaining({ name: 'Test Bay' }),
      }),
      expect.objectContaining({
        city: expect.objectContaining({ name: 'Test Bay' }),
      }),
    ]);
    expect(weather.send).toHaveBeenCalledTimes(1);
  });

  it('does not persist failed policy evaluations and permits a later retry', async () => {
    policy.calculate.mockImplementationOnce(() => {
      throw new RangeError('Invalid forecast');
    });
    await expect(service.getRanking('Test Bay')).rejects.toThrow(
      'Invalid forecast',
    );
    expect(repository.save).not.toHaveBeenCalled();
    expect(eventStore.append).not.toHaveBeenCalled();
    await expect(service.getRanking('Test Bay')).resolves.toMatchObject({
      city: { name: 'Test Bay' },
    });
    expect(weather.send).toHaveBeenCalledTimes(2);
  });
  it('maps worker failures and invalid city input to domain errors', async () => {
    weather.send.mockReturnValue(
      of({ status: 'ERROR', code: 'CITY_NOT_FOUND', message: 'Unknown city' }),
    );
    await expect(service.getRanking('Test Bay')).rejects.toMatchObject({
      code: 'CITY_NOT_FOUND',
      message: 'Unknown city',
    });

    weather.send.mockReturnValue(throwError(() => new Error('offline')));
    await expect(service.getRanking('Other Bay')).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
    });
    await expect(service.getRanking(' ')).rejects.toBeInstanceOf(
      CityQueryError,
    );
  });
});
