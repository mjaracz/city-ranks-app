import { Test } from '@nestjs/testing';
import { ActivityRankingWorkerModule } from '../../../activity-ranking-worker/src/activity-ranking-worker.module';
import { WeatherWorkerModule } from '../weather-worker.module';
import { OpenMeteoApiError, OpenMeteoProvider } from './open-meteo.provider';

const coordinates: OpenMeteoProvider.Coordinates = {
  latitude: 52.52,
  longitude: 13.405,
};

const apiResponse = {
  latitude: 52.5,
  longitude: 13.4,
  elevation: 38,
  timezone: 'UTC',
  timezone_abbreviation: 'UTC',
  utc_offset_seconds: 0,
  current: {
    time: '2026-10-13T12:00',
    interval: 900,
    temperature_2m: 14.5,
    relative_humidity_2m: 65,
    apparent_temperature: 12.3,
    precipitation: 0.2,
    weather_code: 3,
    wind_speed_10m: 10.5,
    wind_direction_10m: 250,
  },
};

describe('OpenMeteoProvider', () => {
  let originalEnvironment: NodeJS.ProcessEnv;
  let originalFetch: typeof fetch;
  let requests: Array<{ input: RequestInfo | URL; options?: RequestInit }>;
  let upstreamResponse: Response | undefined;
  let transportError: Error | undefined;

  beforeEach(() => {
    originalEnvironment = process.env;
    originalFetch = globalThis.fetch;
    process.env = {
      ...process.env,
      OPEN_METEO_FORECAST_API_URL: '',
      OPEN_METEO_API_KEY: '',
      WEATHER_DATABASE_URL: 'postgresql://weather:local@127.0.0.1:5433/weather',
      ACTIVITY_RANKING_DATABASE_URL:
        'postgresql://ranking:local@127.0.0.1:5434/activity_ranking',
    };
    requests = [];
    upstreamResponse = undefined;
    transportError = undefined;
    globalThis.fetch = async (input, options) => {
      requests.push({ input, options });
      if (transportError) {
        throw transportError;
      }
      if (!upstreamResponse) {
        throw new Error('Unexpected HTTP request');
      }
      return upstreamResponse;
    };
  });

  afterEach(() => {
    process.env = originalEnvironment;
    globalThis.fetch = originalFetch;
  });

  it('requests fixed units and maps current weather with grid, time and source metadata', async () => {
    upstreamResponse = Response.json(apiResponse);

    const weather = await new OpenMeteoProvider().getCurrentWeather(
      coordinates,
    );

    expect(weather).toEqual({
      source: {
        name: 'Open-Meteo',
        attributionUrl: 'https://open-meteo.com/',
        license: 'CC BY 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
        modifications:
          'Field names normalized; observation time converted to UTC.',
      },
      requestedCoordinates: coordinates,
      gridCoordinates: { latitude: 52.5, longitude: 13.4 },
      elevationMeters: 38,
      timezone: 'UTC',
      timezoneAbbreviation: 'UTC',
      utcOffsetSeconds: 0,
      observedAt: '2026-10-13T12:00:00.000Z',
      observationIntervalSeconds: 900,
      temperatureCelsius: 14.5,
      relativeHumidityPercent: 65,
      apparentTemperatureCelsius: 12.3,
      precipitationMillimeters: 0.2,
      weatherCode: 3,
      windSpeedKilometersPerHour: 10.5,
      windDirectionDegrees: 250,
    });

    const [{ input, options }] = requests;
    const url = new URL(String(input));
    expect(url.origin + url.pathname).toBe(
      'https://api.open-meteo.com/v1/forecast',
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      latitude: '52.52',
      longitude: '13.405',
      current:
        'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m',
      temperature_unit: 'celsius',
      wind_speed_unit: 'kmh',
      precipitation_unit: 'mm',
      timezone: 'UTC',
      timeformat: 'iso8601',
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('uses the configured customer endpoint and key', async () => {
    process.env.OPEN_METEO_FORECAST_API_URL =
      ' https://customer-api.open-meteo.com/v1/forecast ';
    process.env.OPEN_METEO_API_KEY = ' example-api-key ';
    upstreamResponse = Response.json(apiResponse);

    await new OpenMeteoProvider().getCurrentWeather(coordinates);

    const [{ input }] = requests;
    const url = new URL(String(input));
    expect(url.hostname).toBe('customer-api.open-meteo.com');
    expect(url.searchParams.get('apikey')).toBe('example-api-key');
  });

  it.each([
    ['invalid URL', 'invalid', ''],
    ['HTTP endpoint', 'http://api.open-meteo.com/v1/forecast', ''],
    [
      'embedded credentials',
      'https://user:password@api.open-meteo.com/v1/forecast',
      '',
    ],
    [
      'key on the free endpoint',
      'https://api.open-meteo.com/v1/forecast',
      'key',
    ],
    [
      'customer endpoint without a key',
      'https://customer-api.open-meteo.com/v1/forecast',
      '',
    ],
  ])('rejects %s at construction', (_name, endpoint, apiKey) => {
    process.env.OPEN_METEO_FORECAST_API_URL = endpoint;
    process.env.OPEN_METEO_API_KEY = apiKey;

    expect(() => new OpenMeteoProvider()).toThrow();
    expect(requests).toEqual([]);
  });

  it.each([
    ['missing coordinates', null],
    ['latitude outside its range', { latitude: 91, longitude: 13 }],
    ['longitude outside its range', { latitude: 52, longitude: -181 }],
    ['non-finite latitude', { latitude: NaN, longitude: 13 }],
  ])(
    'rejects %s before sending a request',
    async (_name, invalidCoordinates) => {
      await expect(
        new OpenMeteoProvider().getCurrentWeather(invalidCoordinates),
      ).rejects.toBeInstanceOf(RangeError);
      expect(requests).toEqual([]);
    },
  );

  it('preserves an upstream HTTP failure status', async () => {
    upstreamResponse = new Response('rate limited', { status: 429 });

    await expect(
      new OpenMeteoProvider().getCurrentWeather(coordinates),
    ).rejects.toMatchObject({
      name: 'OpenMeteoApiError',
      statusCode: 429,
      message: 'Open-Meteo request failed with HTTP 429',
    });
  });

  it.each([
    ['missing current data', { ...apiResponse, current: null }],
    [
      'invalid observation time',
      { ...apiResponse, current: { ...apiResponse.current, time: 'invalid' } },
    ],
    [
      'missing numeric measurement',
      {
        ...apiResponse,
        current: { ...apiResponse.current, temperature_2m: null },
      },
    ],
  ])(
    'rejects %s instead of returning a partial model',
    async (_name, payload) => {
      upstreamResponse = Response.json(payload);

      await expect(
        new OpenMeteoProvider().getCurrentWeather(coordinates),
      ).rejects.toBeInstanceOf(OpenMeteoApiError);
    },
  );

  it('reports invalid JSON from the upstream API', async () => {
    upstreamResponse = new Response('invalid json');

    await expect(
      new OpenMeteoProvider().getCurrentWeather(coordinates),
    ).rejects.toThrow('Open-Meteo returned invalid JSON');
  });

  it('reports a timeout while receiving the response body', async () => {
    upstreamResponse = Response.json(apiResponse);
    upstreamResponse.json = async () => {
      throw new DOMException('Timed out', 'TimeoutError');
    };

    await expect(
      new OpenMeteoProvider().getCurrentWeather(coordinates),
    ).rejects.toThrow('Open-Meteo request timed out');
  });

  it('maps transport errors to the provider error contract', async () => {
    transportError = new TypeError('Connection refused');

    await expect(
      new OpenMeteoProvider().getCurrentWeather(coordinates),
    ).rejects.toThrow('Open-Meteo request failed');
  });

  it('resolves through weather DI while ranking does not load Open-Meteo configuration', async () => {
    const weatherModule = await Test.createTestingModule({
      imports: [WeatherWorkerModule],
    }).compile();
    try {
      expect(weatherModule.get(OpenMeteoProvider)).toBeInstanceOf(
        OpenMeteoProvider,
      );
    } finally {
      await weatherModule.close();
    }

    process.env.OPEN_METEO_FORECAST_API_URL = 'invalid';
    const rankingModule = await Test.createTestingModule({
      imports: [ActivityRankingWorkerModule],
    }).compile();
    try {
      expect(() => rankingModule.get(OpenMeteoProvider)).toThrow();
    } finally {
      await rankingModule.close();
    }
    expect(requests).toEqual([]);
  });
});
