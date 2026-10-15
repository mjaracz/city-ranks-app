import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';

import { createLoadFixtures } from '../../../../scripts/load/load-fixtures';
import { createOpenMeteoCurrentRequest } from '../../src/data-providers/open-meteo-request';
import { OpenMeteoConfiguration } from '../../src/data-providers/open-meteo.configuration';
import { OpenMeteoProvider } from '../../src/data-providers/open-meteo.provider';
import { WeatherPolicyModule } from '../../src/domain/weather-policy.module';
import { OpenMeteoResponseParser } from '../../src/services/open-meteo-response-parser.service';
import { WeatherApiQueryCacheRepository } from '../../src/weather-api-query-cache.repository';

describe('Open-Meteo cache flow', () => {
  const fixture = createLoadFixtures(1, 64, 'provider-test')[0];
  const cache = {
    findFresh: jest.fn<WeatherApiQueryCacheRepository['findFresh']>(),
    save: jest.fn<WeatherApiQueryCacheRepository['save']>(),
  };
  let originalEnvironment: NodeJS.ProcessEnv;
  let fetchSpy: jest.Spied<typeof fetch>;
  let moduleRef: TestingModule;
  let client: OpenMeteoProvider;
  beforeEach(async () => {
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
    moduleRef = await Test.createTestingModule({
      imports: [WeatherPolicyModule],
      providers: [
        OpenMeteoConfiguration,
        OpenMeteoProvider,
        OpenMeteoResponseParser,
        { provide: WeatherApiQueryCacheRepository, useValue: cache },
      ],
    }).compile();
    client = moduleRef.get(OpenMeteoProvider);
  });
  afterEach(async () => {
    await moduleRef.close();
    fetchSpy.mockRestore();
    process.env = originalEnvironment;
  });

  it('serves cache hits without fetching upstream', async () => {
    cache.findFresh.mockResolvedValue({
      response: fixture.response,
      cachedAt: new Date(),
    });
    expect(
      (await client.getCurrentWeather(fixture.coordinates)).temperatureCelsius,
    ).toBe(14.5);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('coalesces identical misses and caches one validated response', async () => {
    cache.findFresh.mockResolvedValue(null);
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
      client.getCurrentWeather(fixture.coordinates),
    ).rejects.toThrow();
    await expect(
      client.getCurrentWeather(fixture.coordinates),
    ).rejects.toThrow();
    expect(cache.save).not.toHaveBeenCalled();
  });
  it('blocks upstream calls on a load-test cache miss', async () => {
    process.env.WEATHER_API_CACHE_ONLY = 'true';
    cache.findFresh.mockResolvedValue(null);
    await expect(client.getCurrentWeather(fixture.coordinates)).rejects.toThrow(
      'disabled',
    );
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
  it('rejects invalid cached current weather using the same field contract as live responses', async () => {
    const response = structuredClone(fixture.response);
    (response.current as Record<string, unknown>).temperature_2m = '14.5';
    cache.findFresh.mockResolvedValue({ response, cachedAt: new Date() });

    await expect(client.getCurrentWeather(fixture.coordinates)).rejects.toThrow(
      'invalid response',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(cache.save).not.toHaveBeenCalled();
  });
});
