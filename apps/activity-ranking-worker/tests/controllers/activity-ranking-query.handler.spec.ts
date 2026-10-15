import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';

import { ActivityRankingRepository } from '../../src/activity-ranking.repository';
import { ActivityRankingQueryHandler } from '../../src/controllers/activity-ranking-query.handler';

describe('ActivityRankingQueryHandler', () => {
  let module: TestingModule;
  let handler: ActivityRankingQueryHandler;
  const repository = {
    findByCityAndPeriod:
      jest.fn<ActivityRankingRepository['findByCityAndPeriod']>(),
  };
  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        ActivityRankingQueryHandler,
        { provide: ActivityRankingRepository, useValue: repository },
      ],
    }).compile();
    handler = module.get(ActivityRankingQueryHandler);
  });
  beforeEach(() => {
    jest.clearAllMocks();
    repository.findByCityAndPeriod.mockResolvedValue([]);
  });
  afterAll(async () => module.close());
  it('uses the validated city and exclusive period in a repository query', async () => {
    await expect(
      handler.findRankings({
        city: 'Porto',
        from: '2026-10-01',
        until: '2026-10-08',
      }),
    ).resolves.toEqual([]);
    expect(repository.findByCityAndPeriod).toHaveBeenCalledWith(
      'Porto',
      '2026-10-01',
      '2026-10-08',
    );
  });
  it.each([
    null,
    { city: 1, from: '2026-10-01', until: '2026-10-08' },
    { city: 'Porto', from: 'invalid', until: '2026-10-08' },
  ])('rejects invalid requests before repository access: %p', async (query) => {
    await expect(
      handler.findRankings(
        query as Parameters<ActivityRankingQueryHandler['findRankings']>[0],
      ),
    ).rejects.toThrow();
    expect(repository.findByCityAndPeriod).not.toHaveBeenCalled();
  });
});
