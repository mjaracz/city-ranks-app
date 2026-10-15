import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';

import { WEATHER_FORECAST_REFRESH_COMMAND } from '@libs/contracts';
import { JetStreamCommandBus } from '@libs/messaging';

import {
  DomainCommandFactory,
  PreparedDomainCommand,
} from '../../src/domain/domain-command.factory';
import { DomainCommandService } from '../../src/services/domain-command.service';

describe('DomainCommandService', () => {
  let module: TestingModule;
  let service: DomainCommandService;
  const bus = { publish: jest.fn<JetStreamCommandBus['publish']>() };
  const commands = {
    weather: jest.fn<DomainCommandFactory['weather']>(),
    ranking: jest.fn<DomainCommandFactory['ranking']>(),
  };
  const prepared: PreparedDomainCommand = {
    subject: WEATHER_FORECAST_REFRESH_COMMAND,
    command: {
      commandId: 'id',
      commandType: 'test',
      correlationId: 'id',
      occurredAt: '2026-10-15T00:00:00Z',
      payload: { city: 'Test' },
    },
    receipt: { commandId: 'id', accepted: true, domain: 'weather' },
  };
  beforeEach(async () => {
    jest.resetAllMocks();
    bus.publish.mockResolvedValue(undefined);
    commands.weather.mockReturnValue(prepared);
    commands.ranking.mockReturnValue(prepared);
    module = await Test.createTestingModule({
      providers: [
        DomainCommandService,
        { provide: JetStreamCommandBus, useValue: bus },
        { provide: DomainCommandFactory, useValue: commands },
      ],
    }).compile();
    service = module.get(DomainCommandService);
  });
  afterEach(async () => module.close());
  it('publishes the prepared command and returns the matching acceptance receipt', async () => {
    await expect(service.requestWeatherRefresh('Test', 0, 0)).resolves.toBe(
      prepared.receipt,
    );
    expect(commands.weather).toHaveBeenCalledWith('Test', 0, 0);
    expect(bus.publish).toHaveBeenCalledWith(
      prepared.subject,
      prepared.command,
    );
    await service.requestActivityRanking('Test');
    expect(commands.ranking).toHaveBeenCalledWith('Test');
  });
  it('does not claim acceptance when publication fails', async () => {
    bus.publish.mockRejectedValue(new Error('offline'));
    await expect(service.requestActivityRanking('Test')).rejects.toThrow(
      'offline',
    );
  });
  it('rejects the returned promise without publishing when a request violates the command policy', async () => {
    commands.ranking.mockImplementation(() => {
      throw new RangeError('Invalid request');
    });
    await expect(service.requestActivityRanking('')).rejects.toThrow(
      'Invalid request',
    );
    expect(bus.publish).not.toHaveBeenCalled();
  });
});
