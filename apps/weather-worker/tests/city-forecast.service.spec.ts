import { jest } from '@jest/globals';
import { CityQueryError } from '@libs/contracts/city-query';
import { Test, TestingModule } from '@nestjs/testing';
import { CityForecastService } from '../src/services/city-forecast.service';
import { OpenMeteoResponseParser } from '../src/services/open-meteo-response-parser.service';
import { OpenMeteoJsonClient } from '../src/data-providers/open-meteo-json.client';
import {
  WeatherApiQueryCacheRepository,
  CachedWeatherApiResponse,
} from '../src/weather-api-query-cache.repository';
import { JetStreamEventStore } from '@libs/messaging/jetstream-event-store';
import {
  forecastFixture,
  testCity,
  upstreamFixture,
} from '../../city-ranking-test.fixtures';

describe('City forecast acquisition', () => {
  let moduleRef: TestingModule;
  let forecasts: CityForecastService;
  let parser: OpenMeteoResponseParser;
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
        OpenMeteoResponseParser,
        { provide: WeatherApiQueryCacheRepository, useValue: cache },
        { provide: JetStreamEventStore, useValue: events },
      ],
    }).compile();
    forecasts = moduleRef.get(CityForecastService);
    parser = moduleRef.get(OpenMeteoResponseParser);
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
    expect(() => parser.parseCity({ results: [] })).toThrow('No matching city');
    expect(() =>
      parser.parseCity({ results: [{ ...testCity, id: 1 }] }),
    ).toThrow();
    const dates = forecastFixture().days.map((day) => day.date);
    const data = upstreamFixture('forecast');
    (data.daily as Record<string, unknown>).precipitation_sum = [NaN];
    expect(() => parser.parseWeather(data, dates, testCity.timezone)).toThrow();
  });
  it('keeps absent dates and incomplete snow coverage as missing data', () => {
    const dates = forecastFixture().days.map((day) => day.date);
    const data = upstreamFixture('forecast');
    const daily = data.daily as Record<string, unknown[]>;
    for (const key of Object.keys(daily)) daily[key] = daily[key].slice(1);
    const hourly = data.hourly as Record<string, unknown[]>;
    hourly.time = hourly.time.slice(1);
    hourly.snow_depth = hourly.snow_depth.slice(1);
    const parsed = parser.parseWeather(data, dates, testCity.timezone);
    expect(parsed[0]).toMatchObject({
      temperatureMinCelsius: null,
      snowDepthMaxMeters: null,
    });
    const marine = upstreamFixture('marine');
    (marine.daily as Record<string, unknown[]>).wave_height_max = dates.map(
      () => null,
    );
    expect(
      parser
        .parseMarine(marine, dates, testCity.timezone)
        .days.every((day) => day.height === null),
    ).toBe(true);
  });
  it('respects cache-only mode without calling any upstream API', async () => {
    process.env.WEATHER_API_CACHE_ONLY = 'true';
    await expect(forecasts.getForecast('Test Bay')).rejects.toThrow(
      'weather cache',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('rejects malformed live weather before caching it or publishing an accepted snapshot', async () => {
    const saveSpy = jest.spyOn(cache, 'save');
    fetchSpy.mockImplementation(async (url) => {
      const kind = new URL(String(url)).pathname.slice(1) as
        'geocoding' | 'forecast' | 'marine';
      const data = upstreamFixture(kind);
      if (kind === 'forecast')
        (data.daily as Record<string, unknown[]>).temperature_2m_min[0] = '15';
      return Response.json(data);
    });

    await expect(forecasts.getForecast('Test Bay')).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
    });
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy.mock.calls[0][1].endpoint).toContain('/geocoding');
    expect(events.append).not.toHaveBeenCalled();
  });

  it('validates cached OpenMeteo responses before returning any forecast', async () => {
    const data = upstreamFixture('geocoding');
    (data.results as Record<string, unknown>[])[0].latitude = '54.5';
    jest.spyOn(cache, 'findFresh').mockResolvedValue({
      response: data,
      cachedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(forecasts.getForecast('Test Bay')).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(events.append).not.toHaveBeenCalled();
  });

  it('treats malformed marine data as insufficient data without caching it', async () => {
    const saveSpy = jest.spyOn(cache, 'save');
    fetchSpy.mockImplementation(async (url) => {
      const kind = new URL(String(url)).pathname.slice(1) as
        'geocoding' | 'forecast' | 'marine';
      const data = upstreamFixture(kind);
      if (kind === 'marine')
        (data.daily as Record<string, unknown[]>).wave_height_max[0] = '1.5';
      return Response.json(data);
    });

    const forecast = await forecasts.getForecast('Test Bay');
    expect(forecast.marineStatus).toBe('INSUFFICIENT_DATA');
    expect(forecast.marineFetchedAt).toBeNull();
    expect(saveSpy).toHaveBeenCalledTimes(2);
    expect(forecast.days.every((day) => day.waveHeightMaxMeters === null)).toBe(
      true,
    );
  });

  it('rejects an expired completed forecast before publishing its snapshot', async () => {
    const forecast = forecastFixture();
    jest
      .spyOn(moduleRef.get(OpenMeteoJsonClient), 'get')
      .mockResolvedValueOnce({
        value: testCity,
        fetchedAt: new Date(),
        freshUntil: new Date(Date.now() + 60_000),
      })
      .mockResolvedValueOnce({
        value: forecast.days,
        fetchedAt: new Date(forecast.weatherFetchedAt),
        freshUntil: new Date('2000-01-01T00:00:00Z'),
      })
      .mockRejectedValueOnce(
        new CityQueryError('UPSTREAM_UNAVAILABLE', 'No marine data'),
      );

    await expect(forecasts.getForecast('Test Bay')).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
    });
    expect(events.append).not.toHaveBeenCalled();
  });
});
