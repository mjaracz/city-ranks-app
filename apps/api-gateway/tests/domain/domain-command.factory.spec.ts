import { Test } from '@nestjs/testing';

import { ACTIVITY_RANKING_REFRESH_COMMAND } from '@libs/contracts';

import { DomainCommandFactory } from '../../src/domain/domain-command.factory';

describe('DomainCommandFactory', () => {
  it('creates independent correlated ranking commands with normalized payloads', async () => {
    const module = await Test.createTestingModule({
      providers: [DomainCommandFactory],
    }).compile();
    const factory = module.get(DomainCommandFactory);
    const first = factory.ranking(' Porto ');
    const ranking = factory.ranking(' Rome ');
    expect(first.command.payload).toEqual({ city: 'Porto' });
    expect(ranking.subject).toBe(ACTIVITY_RANKING_REFRESH_COMMAND);
    expect(ranking.command.payload).toEqual({ city: 'Rome' });
    expect(first.command.commandId).not.toBe(ranking.command.commandId);
    for (const item of [first, ranking]) {
      expect(item.subject).toBe(ACTIVITY_RANKING_REFRESH_COMMAND);
      expect(item.command.commandType).toBe(
        'activity-ranking.ranking.refresh.requested.v1',
      );
      expect(item.receipt.domain).toBe('activity-ranking');
      expect(item.command.correlationId).toBe(item.command.commandId);
      expect(item.receipt.commandId).toBe(item.command.commandId);
      expect(item.receipt.accepted).toBe(true);
      expect(Number.isNaN(Date.parse(item.command.occurredAt))).toBe(false);
    }
    expect(() => factory.ranking(' ')).toThrow();
    await module.close();
  });
});
