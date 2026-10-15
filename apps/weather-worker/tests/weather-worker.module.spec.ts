import { jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { WeatherWorkerModule } from '../src/weather-worker.module';
import { CityForecastService } from '../src/services/city-forecast.service';
import { OpenMeteoJsonClient } from '../src/data-providers/open-meteo-json.client';
import { WeatherApiQueryCacheRepository } from '../src/weather-api-query-cache.repository';
import {
  WEATHER_MONGO_CLIENT,
  WEATHER_MONGO_DATABASE,
  WEATHER_API_CACHE_COLLECTION,
} from '../src/infrastructure/weather-mongo.providers';
import { WEATHER_COMMAND_CONSUMER } from '../src/infrastructure/weather-command-consumer';
import { JetStreamEventStore } from '@libs/messaging';
import { forecastFixture } from '../../city-ranking-test.fixtures';

describe('WeatherWorkerModule composition', () => {
  it('builds a forecast with production domain policies and replaced infrastructure ports', async () => {
    const original = process.env;
    process.env = {
      ...original,
      OPEN_METEO_API_KEY: '',
      OPEN_METEO_FORECAST_API_URL: 'https://example.invalid/forecast',
    };
    const forecast = forecastFixture();
    const source = {
      fetchedAt: new Date(forecast.weatherFetchedAt),
      freshUntil: new Date(forecast.freshUntil),
    };
    const client = { get: jest.fn<OpenMeteoJsonClient['get']>() };
    client.get
      .mockResolvedValueOnce({ ...source, value: forecast.city })
      .mockResolvedValueOnce({ ...source, value: forecast.days })
      .mockResolvedValueOnce({
        ...source,
        value: {
          latitude: forecast.city.latitude,
          longitude: forecast.city.longitude,
          days: forecast.days.map(() => ({ height: 1.5, period: 10 })),
        },
      });
    const events = {
      append: jest
        .fn<JetStreamEventStore['append']>()
        .mockResolvedValue(undefined),
    };
    const module = await Test.createTestingModule({
      imports: [WeatherWorkerModule],
    })
      .overrideProvider(OpenMeteoJsonClient)
      .useValue(client)
      .overrideProvider(JetStreamEventStore)
      .useValue(events)
      .overrideProvider(WeatherApiQueryCacheRepository)
      .useValue({})
      .overrideProvider(WEATHER_MONGO_CLIENT)
      .useValue({ close: jest.fn(async () => {}) })
      .overrideProvider(WEATHER_MONGO_DATABASE)
      .useValue({})
      .overrideProvider(WEATHER_API_CACHE_COLLECTION)
      .useValue({})
      .overrideProvider(WEATHER_COMMAND_CONSUMER)
      .useValue({ isReady: true, stop: jest.fn(async () => {}) })
      .compile();
    try {
      const result = await module
        .get(CityForecastService)
        .getForecast('Test Bay');
      expect(result.marineStatus).toBe('AVAILABLE');
      expect(result.days).toHaveLength(7);
      expect(events.append).toHaveBeenCalledWith(
        expect.objectContaining({ payload: result }),
      );
    } finally {
      await module.close();
      process.env = original;
    }
  });
});
