import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { of } from 'rxjs';

import { WEATHER_WORKER_CLIENT } from '@libs/contracts';
import { JetStreamEventStore } from '@libs/messaging';

import { forecastFixture } from '../../city-ranking-test.fixtures';
import { ActivityRankingWorkerModule } from '../src/activity-ranking-worker.module';
import { CityRankingRepository } from '../src/city-ranking.repository';
import { ACTIVITY_RANKING_COMMAND_CONSUMER } from '../src/infrastructure/activity-ranking-command-consumer';
import { ACTIVITY_RANKING_KNEX } from '../src/infrastructure/activity-ranking-knex';
import { CityRankingService } from '../src/services/city-ranking.service';

describe('ActivityRankingWorkerModule composition', () => {
  it('computes and persists a city ranking using the production injected policy graph', async () => {
    const repository = {
      findFresh: jest.fn(async () => null),
      findById: jest.fn(async () => null),
      save: jest.fn(async () => {}),
    };
    const events = {
      append: jest
        .fn<JetStreamEventStore['append']>()
        .mockResolvedValue(undefined),
    };
    const module = await Test.createTestingModule({
      imports: [ActivityRankingWorkerModule],
    })
      .overrideProvider(CityRankingRepository)
      .useValue(repository)
      .overrideProvider(JetStreamEventStore)
      .useValue(events)
      .overrideProvider(WEATHER_WORKER_CLIENT)
      .useValue({
        send: () => of({ status: 'OK', result: forecastFixture() }),
        close: jest.fn(),
      })
      .overrideProvider(ACTIVITY_RANKING_KNEX)
      .useValue({ destroy: jest.fn(async () => {}) })
      .overrideProvider(ACTIVITY_RANKING_COMMAND_CONSUMER)
      .useValue({ isReady: true, stop: jest.fn(async () => {}) })
      .compile();
    try {
      const result = await module
        .get(CityRankingService)
        .getRanking('Test Bay');
      expect(result.days).toHaveLength(7);
      expect(result.days[0].activities.map((item) => item.rank)).toEqual([
        1, 1, 3, 4,
      ]);
      expect(repository.save).toHaveBeenCalledWith('test bay', result);
      expect(events.append).toHaveBeenCalledWith(
        expect.objectContaining({ payload: result }),
      );
    } finally {
      await module.close();
    }
  });
});
