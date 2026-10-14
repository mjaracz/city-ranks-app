import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import {
  CityForecastService,
  parseCity,
  parseMarine,
  parseWeather,
} from '../src/city-forecast.service';
import { OpenMeteoJsonClient } from '../src/data-providers/open-meteo-json.client';
import {
  WeatherApiQueryCacheRepository,
  CachedWeatherApiResponse,
} from '../src/weather-api-query-cache.repository';
import { JetStreamEventStore } from '../../../libs/messaging/src/jetstream-event-store';
import {
  forecastFixture,
  testCity,
  upstreamFixture,
} from '../../city-ranking-test.fixtures';

describe('City forecast acquisition', () => {
  let moduleRef: TestingModule;
  let forecasts: CityForecastService;
  let fetchSpy: jest.Spied<typeof fetch>;
  let originalEnvironment: NodeJS.ProcessEnv;
  let cache: WeatherApiQueryCacheRepository;
  const events = { append: jest.fn<JetStreamEventStore['append']>() };
  beforeEach(async () => {
    originalEnvironment = process.env;
    process.env = {
      ...process.env,
      OPEN_METEO_API_KEY: '',
      WEATHER_API_CACHE_ONLY: 'false',
      OPEN_METEO_FORECAST_API_URL: 'https://ranking-test.invalid/forecast',
      OPEN_METEO_GEOCODING_API_URL: 'https://ranking-test.invalid/geocoding',
      OPEN_METEO_MARINE_API_URL: 'https://ranking-test.invalid/marine',
    };
    const entries = new Map<
      string,
      CachedWeatherApiResponse & { expiresAt: Date }
    >();
    cache = {
      findFresh: async (key) => {
        const item = entries.get(key);
        return item && item.expiresAt > new Date() ? item : null;
      },
      save: async (key, _query, response, expiresAt, cachedAt = new Date()) => {
        entries.set(key, { response, cachedAt, expiresAt });
      },
    };
    events.append.mockReset();
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url) =>
        Response.json(
          upstreamFixture(
            new URL(String(url)).pathname.slice(1) as
              'geocoding' | 'forecast' | 'marine',
          ),
        ),
      );
    moduleRef = await Test.createTestingModule({
      providers: [
        CityForecastService,
        OpenMeteoJsonClient,
        { provide: WeatherApiQueryCacheRepository, useValue: cache },
        { provide: JetStreamEventStore, useValue: events },
      ],
    }).compile();
    forecasts = moduleRef.get(CityForecastService);
  });
  afterEach(async () => {
    fetchSpy.mockRestore();
    await moduleRef.close();
    process.env = originalEnvironment;
  });

  it('resolves a name, persists each source response and reuses them across provider instances', async () => {
    const first = await forecasts.getForecast(' Test  Bay ');
    const second = await forecasts.getForecast('test bay');
    expect(first).toEqual(second);
    expect(first.city).toEqual(testCity);
    expect(first.days).toHaveLength(7);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(first.marineStatus).toBe('AVAILABLE');
    expect(events.append).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'forecast-snapshot-accepted',
        payload: first,
      }),
    );
  });
  it('coalesces concurrent requests for the same upstream query', async () => {
    await Promise.all(
      Array.from({ length: 8 }, () => forecasts.getForecast('Test Bay')),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
  it('allows weather ranking when the marine provider fails and does not claim non-applicability', async () => {
    fetchSpy.mockImplementation(async (url) =>
      new URL(String(url)).pathname === '/marine'
        ? new Response('', { status: 503 })
        : Response.json(
            upstreamFixture(
              new URL(String(url)).pathname.slice(1) as
                'geocoding' | 'forecast',
            ),
          ),
    );
    const forecast = await forecasts.getForecast('Test Bay');
    expect(forecast.marineStatus).toBe('INSUFFICIENT_DATA');
    expect(forecast.marineFetchedAt).toBeNull();
    expect(forecast.days.every((day) => day.waveHeightMaxMeters === null)).toBe(
      true,
    );
  });
  it('marks a distant observed marine grid as outside the selected city scope', async () => {
    fetchSpy.mockImplementation(async (url) => {
      const kind = new URL(String(url)).pathname.slice(1) as
        'geocoding' | 'forecast' | 'marine';
      const data = upstreamFixture(kind);
      return Response.json(
        kind === 'marine' ? { ...data, latitude: 50 } : data,
      );
    });
    expect((await forecasts.getForecast('Test Bay')).marineStatus).toBe(
      'NOT_APPLICABLE',
    );
  });
  it('returns typed not-found and rejects invalid geocoding and malformed weather', () => {
    expect(() => parseCity({ results: [] })).toThrow('No matching city');
    expect(() => parseCity({ results: [{ ...testCity, id: 1 }] })).toThrow();
    const dates = forecastFixture().days.map((day) => day.date);
    const data = upstreamFixture('forecast');
    (data.daily as Record<string, unknown>).precipitation_sum = [NaN];
    expect(() => parseWeather(data, dates, testCity.timezone)).toThrow();
  });
  it('keeps absent dates and incomplete snow coverage as missing data', () => {
    const dates = forecastFixture().days.map((day) => day.date);
    const data = upstreamFixture('forecast');
    const daily = data.daily as Record<string, unknown[]>;
    for (const key of Object.keys(daily)) daily[key] = daily[key].slice(1);
    const hourly = data.hourly as Record<string, unknown[]>;
    hourly.time = hourly.time.slice(1);
    hourly.snow_depth = hourly.snow_depth.slice(1);
    const parsed = parseWeather(data, dates, testCity.timezone);
    expect(parsed[0]).toMatchObject({
      temperatureMinCelsius: null,
      snowDepthMaxMeters: null,
    });
    const marine = upstreamFixture('marine');
    (marine.daily as Record<string, unknown[]>).wave_height_max = dates.map(
      () => null,
    );
    expect(
      parseMarine(marine, dates, testCity.timezone).days.every(
        (day) => day.height === null,
      ),
    ).toBe(true);
  });
  it('respects cache-only mode without calling any upstream API', async () => {
    process.env.WEATHER_API_CACHE_ONLY = 'true';
    await expect(forecasts.getForecast('Test Bay')).rejects.toThrow(
      'weather cache',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
