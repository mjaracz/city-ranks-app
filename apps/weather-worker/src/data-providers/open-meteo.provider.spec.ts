import { OpenMeteoProvider } from './open-meteo.provider';
import { jest } from '@jest/globals';
import { WeatherApiQueryCacheRepository } from '../weather-api-query-cache.repository';
import { createLoadFixtures } from '../../../../scripts/load/load-fixtures';
import { createOpenMeteoCurrentRequest } from './open-meteo-request';

describe('Open-Meteo cache flow', () => {
  const fixture = createLoadFixtures(1, 64, 'provider-test')[0];
  const cache = {
    findFresh: jest.fn<WeatherApiQueryCacheRepository['findFresh']>(),
    save: jest.fn<WeatherApiQueryCacheRepository['save']>(),
  };
  let originalEnvironment: NodeJS.ProcessEnv;
  let fetchSpy: jest.Spied<typeof fetch>;
  beforeEach(() => {
    originalEnvironment = process.env;
    process.env = {
      ...process.env,
      OPEN_METEO_FORECAST_API_URL: 'https://load-fixture.invalid/v1/forecast',
      OPEN_METEO_API_KEY: '',
      WEATHER_API_CACHE_ONLY: 'false',
      WEATHER_API_CACHE_TTL_MS: '900000',
    };
    jest.clearAllMocks();
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json(fixture.response));
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    process.env = originalEnvironment;
  });
  const provider = () =>
    new OpenMeteoProvider(cache as WeatherApiQueryCacheRepository);

  it('serves cache hits without fetching upstream', async () => {
    cache.findFresh.mockResolvedValue({
      response: fixture.response,
      cachedAt: new Date(),
    });
    expect(
      (await provider().getCurrentWeather(fixture.coordinates))
        .temperatureCelsius,
    ).toBe(14.5);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('coalesces identical misses and caches one validated response', async () => {
    cache.findFresh.mockResolvedValue(null);
    const client = provider();
    await Promise.all(
      Array.from({ length: 10 }, () =>
        client.getCurrentWeather(fixture.coordinates),
      ),
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(cache.save).toHaveBeenCalledTimes(1);
  });
  it('does not cache failed or invalid upstream responses', async () => {
    cache.findFresh.mockResolvedValue(null);
    fetchSpy
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ current: {} }));
    await expect(
      provider().getCurrentWeather(fixture.coordinates),
    ).rejects.toThrow();
    await expect(
      provider().getCurrentWeather(fixture.coordinates),
    ).rejects.toThrow();
    expect(cache.save).not.toHaveBeenCalled();
  });
  it('blocks upstream calls on a load-test cache miss', async () => {
    process.env.WEATHER_API_CACHE_ONLY = 'true';
    cache.findFresh.mockResolvedValue(null);
    await expect(
      provider().getCurrentWeather(fixture.coordinates),
    ).rejects.toThrow('disabled');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('excludes API keys from both stored query metadata and signatures', () => {
    const first = createOpenMeteoCurrentRequest(
      'https://example.invalid?z=2&a=1',
      fixture.coordinates,
      'secret-one',
    );
    const second = createOpenMeteoCurrentRequest(
      'https://example.invalid?a=1&z=2',
      fixture.coordinates,
      'secret-two',
    );
    expect(first.signature).toBe(second.signature);
    expect(JSON.stringify(first.query)).not.toContain('secret');
    expect(first.query.parameters).not.toHaveProperty('apikey');
  });
});
