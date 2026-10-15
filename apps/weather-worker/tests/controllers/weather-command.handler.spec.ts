import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';

import { DomainCommand } from '@libs/contracts';
import { JetStreamEventStore } from '@libs/messaging';

import {
  createWeatherRefreshCommand,
  WeatherCommandHandler,
} from '../../src/controllers/weather-command.handler';
import { OpenMeteoProvider } from '../../src/data-providers/open-meteo.provider';
import {
  CurrentWeather,
  WeatherCoordinates,
} from '../../src/data-providers/open-meteo.types';
import { WEATHER_COMMAND_CONSUMER } from '../../src/infrastructure/weather-command-consumer';

describe('WeatherCommandHandler', () => {
  let module: TestingModule;
  let handler: WeatherCommandHandler;
  let consume: (
    command: DomainCommand<{ city: string; coordinates?: WeatherCoordinates }>,
  ) => Promise<void>;
  const consumer = {
    isReady: true,
    start: jest.fn(async (callback: typeof consume) => {
      consume = callback;
    }),
    stop: jest.fn(async () => {}),
  };
  const provider = {
    getCurrentWeather: jest.fn<OpenMeteoProvider['getCurrentWeather']>(),
  };
  const events = { append: jest.fn<JetStreamEventStore['append']>() };
  beforeEach(async () => {
    jest.clearAllMocks();
    consumer.isReady = true;
    events.append.mockResolvedValue(undefined);
    module = await Test.createTestingModule({
      providers: [
        WeatherCommandHandler,
        { provide: WEATHER_COMMAND_CONSUMER, useValue: consumer },
        { provide: OpenMeteoProvider, useValue: provider },
        { provide: JetStreamEventStore, useValue: events },
      ],
    }).compile();
    handler = module.get(WeatherCommandHandler);
    await handler.onApplicationBootstrap();
  });
  afterEach(async () => module.close());
  it('publishes a correlated refresh event without fetching when coordinates are omitted', async () => {
    const command = createWeatherRefreshCommand('Porto');
    await consume(command);
    expect(provider.getCurrentWeather).not.toHaveBeenCalled();
    expect(events.append).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'forecast-refresh-requested',
        causationId: command.commandId,
        correlationId: command.correlationId,
        payload: command.payload,
      }),
    );
  });
  it('includes fetched weather when coordinates are provided', async () => {
    const command = createWeatherRefreshCommand('Porto', {
      latitude: 0,
      longitude: 0,
    });
    const currentWeather = { temperatureCelsius: 20 } as CurrentWeather;
    provider.getCurrentWeather.mockResolvedValue(currentWeather);
    await consume(command);
    expect(provider.getCurrentWeather).toHaveBeenCalledWith(
      command.payload.coordinates,
    );
    expect(events.append).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'current-weather-fetched',
        payload: { ...command.payload, currentWeather },
      }),
    );
  });
  it('propagates provider errors to the consumer and does not publish a successful weather event', async () => {
    provider.getCurrentWeather.mockRejectedValue(new Error('offline'));
    await expect(
      consume(
        createWeatherRefreshCommand('Porto', { latitude: 0, longitude: 0 }),
      ),
    ).rejects.toThrow('offline');
    expect(events.append).not.toHaveBeenCalled();
  });
  it('reflects consumer readiness and shuts the injected consumer down', async () => {
    expect(handler.isReady).toBe(true);
    consumer.isReady = false;
    expect(handler.isReady).toBe(false);
    await handler.onModuleDestroy();
    expect(consumer.stop).toHaveBeenCalledTimes(1);
  });
});
