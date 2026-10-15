import { Test } from '@nestjs/testing';

import {
  ACTIVITY_RANKING_REFRESH_COMMAND,
  WEATHER_FORECAST_REFRESH_COMMAND,
} from '@libs/contracts';

import { DomainCommandFactory } from '../../src/domain/domain-command.factory';

describe('DomainCommandFactory', () => {
  it('creates independent correlated weather and ranking commands with normalized payloads', async () => {
    const module = await Test.createTestingModule({
      providers: [DomainCommandFactory],
    }).compile();
    const factory = module.get(DomainCommandFactory);
    const weather = factory.weather(' Porto ', 0, 0),
      ranking = factory.ranking(' Rome ');
    expect(weather.subject).toBe(WEATHER_FORECAST_REFRESH_COMMAND);
    expect(weather.command.payload).toEqual({
      city: 'Porto',
      coordinates: { latitude: 0, longitude: 0 },
    });
    expect(ranking.subject).toBe(ACTIVITY_RANKING_REFRESH_COMMAND);
    expect(ranking.command.payload).toEqual({ city: 'Rome' });
    expect(weather.command.commandId).not.toBe(ranking.command.commandId);
    for (const item of [weather, ranking]) {
      expect(item.command.correlationId).toBe(item.command.commandId);
      expect(item.receipt.commandId).toBe(item.command.commandId);
      expect(item.receipt.accepted).toBe(true);
      expect(Number.isNaN(Date.parse(item.command.occurredAt))).toBe(false);
    }
    expect(() => factory.weather('Porto', 91, 0)).toThrow();
    expect(() => factory.ranking(' ')).toThrow();
    await module.close();
  });
});
