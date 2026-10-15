import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';

import { DomainCommand } from '@libs/contracts';
import { JetStreamEventStore } from '@libs/messaging';

import { rankingFixture } from '../../../city-ranking-test.fixtures';
import {
  ActivityRankingCommandHandler,
  createActivityRankingRefreshCommand,
} from '../../src/controllers/activity-ranking-command.handler';
import { ACTIVITY_RANKING_COMMAND_CONSUMER } from '../../src/infrastructure/activity-ranking-command-consumer';
import { CityRankingService } from '../../src/services/city-ranking.service';

describe('ActivityRankingCommandHandler', () => {
  let module: TestingModule;
  let handler: ActivityRankingCommandHandler;
  let consume: (command: DomainCommand<{ city: string }>) => Promise<void>;
  const consumer = {
    isReady: true,
    start: jest.fn(async (callback: typeof consume) => {
      consume = callback;
    }),
    stop: jest.fn(async () => {}),
  };
  const rankings = { getRanking: jest.fn<CityRankingService['getRanking']>() };
  const events = { append: jest.fn<JetStreamEventStore['append']>() };
  beforeEach(async () => {
    jest.clearAllMocks();
    events.append.mockResolvedValue(undefined);
    rankings.getRanking.mockResolvedValue(rankingFixture());
    module = await Test.createTestingModule({
      providers: [
        ActivityRankingCommandHandler,
        { provide: ACTIVITY_RANKING_COMMAND_CONSUMER, useValue: consumer },
        { provide: CityRankingService, useValue: rankings },
        { provide: JetStreamEventStore, useValue: events },
      ],
    }).compile();
    handler = module.get(ActivityRankingCommandHandler);
    await handler.onApplicationBootstrap();
  });
  afterEach(async () => module.close());
  it('publishes the correlated refresh request and forces recomputation for the requested city', async () => {
    const command = createActivityRankingRefreshCommand('Porto');
    await consume(command);
    expect(events.append).toHaveBeenCalledWith(
      expect.objectContaining({
        causationId: command.commandId,
        correlationId: command.correlationId,
        payload: { city: 'Porto' },
      }),
    );
    expect(rankings.getRanking).toHaveBeenCalledWith('Porto', true);
  });
  it('propagates computation failures so that the consumer can retry', async () => {
    rankings.getRanking.mockRejectedValue(new Error('unavailable'));
    await expect(
      consume(createActivityRankingRefreshCommand('Porto')),
    ).rejects.toThrow('unavailable');
  });
  it('delegates lifecycle readiness and stop to the injected consumer', async () => {
    expect(handler.isReady).toBe(consumer.isReady);
    await handler.onModuleDestroy();
    expect(consumer.stop).toHaveBeenCalledTimes(1);
  });
});
