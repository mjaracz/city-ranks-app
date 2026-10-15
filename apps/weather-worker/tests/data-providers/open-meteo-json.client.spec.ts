import { OpenMeteoConfiguration } from '../../src/data-providers/open-meteo.configuration';
import { WeatherPolicyModule } from '../../src/domain/weather-policy.module';
import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { CityQueryError } from '@libs/contracts/city-query';
import {
  CachedWeatherApiResponse,
  WeatherApiQueryCacheRepository,
} from '../../src/weather-api-query-cache.repository';
import { OpenMeteoJsonClient } from '../../src/data-providers/open-meteo-json.client';

describe('OpenMeteoJsonClient', () => {
  let moduleRef: TestingModule;
  let client: OpenMeteoJsonClient;
  let fetchSpy: jest.Spied<typeof fetch>;
  let originalEnvironment: NodeJS.ProcessEnv;
  const entries = new Map<
    string,
    CachedWeatherApiResponse & { expiresAt: Date }
  >();
  const cache = {
    findFresh: jest.fn<WeatherApiQueryCacheRepository['findFresh']>(),
    save: jest.fn<WeatherApiQueryCacheRepository['save']>(),
  };

  const makeClient = async () => {
    moduleRef = await Test.createTestingModule({
      imports: [WeatherPolicyModule],
      providers: [
        OpenMeteoConfiguration,
        OpenMeteoJsonClient,
        { provide: WeatherApiQueryCacheRepository, useValue: cache },
      ],
    }).compile();
    client = moduleRef.get(OpenMeteoJsonClient);
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    entries.clear();
    originalEnvironment = process.env;
    process.env = {
      ...process.env,
      OPEN_METEO_API_KEY: '',
      WEATHER_API_CACHE_ONLY: 'false',
      OPEN_METEO_FORECAST_API_URL: 'https://ranking-test.invalid/forecast',
      OPEN_METEO_GEOCODING_API_URL: 'https://ranking-test.invalid/geocoding',
      OPEN_METEO_MARINE_API_URL: 'https://ranking-test.invalid/marine',
    };
    cache.findFresh.mockImplementation(async (key: string) => {
      const entry = entries.get(key);
      return entry && entry.expiresAt > new Date() ? entry : null;
    });
    cache.save.mockImplementation(
      async (
        key: string,
        _query: unknown,
        response: Record<string, unknown>,
        expiresAt: Date,
        cachedAt = new Date(),
      ) => {
        entries.set(key, { response, cachedAt, expiresAt });
      },
    );
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ temperature: 18 }));
    await makeClient();
  });

  afterEach(async () => {
    fetchSpy.mockRestore();
    await moduleRef.close();
    process.env = originalEnvironment;
  });

  it('fetches, validates, timestamps and persists an upstream response', async () => {
    const result = await client.get(
      'forecast',
      { latitude: '54.5', longitude: '18.5', apikey: 'must-not-be-cached' },
      (payload) => (payload as { temperature: number }).temperature,
    );

    expect(result.value).toBe(18);
    expect(result.freshUntil.getTime()).toBeGreaterThan(
      result.fetchedAt.getTime(),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const requestUrl = new URL(String(fetchSpy.mock.calls[0][0]));
    expect(requestUrl.searchParams.get('apikey')).toBeNull();
    expect(cache.save).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/),
      {
        endpoint: 'https://ranking-test.invalid/forecast',
        parameters: { latitude: '54.5', longitude: '18.5' },
      },
      { temperature: 18 },
      expect.any(Date),
      expect.any(Date),
    );
  });

  it('serves fresh cached data without calling the upstream provider', async () => {
    const cachedAt = new Date(Date.now() - 60_000);
    const expiresAt = new Date(Date.now() + 60_000);
    cache.findFresh.mockResolvedValueOnce({
      response: { temperature: 7 },
      cachedAt,
      expiresAt,
    });

    await expect(
      client.get(
        'forecast',
        { latitude: '54.5' },
        (value) => (value as { temperature: number }).temperature,
      ),
    ).resolves.toMatchObject({ value: 7, fetchedAt: cachedAt });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(cache.save).not.toHaveBeenCalled();
  });

  it('fails with a typed unavailable error when cache-only mode has a miss', async () => {
    process.env.WEATHER_API_CACHE_ONLY = 'true';

    await expect(
      client.get('forecast', {}, (payload) => payload),
    ).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps provider transport failures to an unavailable domain error', async () => {
    fetchSpy.mockResolvedValue(new Response('', { status: 503 }));

    await expect(
      client.get('forecast', {}, (payload) => payload),
    ).rejects.toBeInstanceOf(CityQueryError);
    expect(cache.save).not.toHaveBeenCalled();
  });

  it('does not cache payloads rejected by the consumer parser', async () => {
    await expect(
      client.get('forecast', {}, () => {
        throw new CityQueryError('UPSTREAM_UNAVAILABLE', 'Invalid measurement');
      }),
    ).rejects.toMatchObject({ message: 'Invalid measurement' });
    expect(cache.save).not.toHaveBeenCalled();
  });

  it('coalesces concurrent upstream requests for the same normalized query', async () => {
    let finish!: (response: Response) => void;
    fetchSpy.mockImplementation(
      () => new Promise((resolve) => (finish = resolve)),
    );

    const first = client.get(
      'forecast',
      { longitude: '18.5', latitude: '54.5' },
      (value) => value,
    );
    const second = client.get(
      'forecast',
      { latitude: '54.5', longitude: '18.5' },
      (value) => value,
    );
    await Promise.resolve();
    finish(Response.json({ temperature: 18 }));

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ value: { temperature: 18 } }),
      expect.objectContaining({ value: { temperature: 18 } }),
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
