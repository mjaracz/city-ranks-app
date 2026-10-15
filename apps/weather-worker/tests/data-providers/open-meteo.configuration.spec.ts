import { Test, TestingModule } from '@nestjs/testing';
import { OpenMeteoConfiguration } from '../../src/data-providers/open-meteo.configuration';
describe('OpenMeteoConfiguration', () => {
  let module: TestingModule;
  let config: OpenMeteoConfiguration;
  let original: NodeJS.ProcessEnv;
  beforeEach(async () => {
    original = process.env;
    process.env = { ...original };
    for (const key of [
      'OPEN_METEO_FORECAST_API_URL',
      'OPEN_METEO_GEOCODING_API_URL',
      'OPEN_METEO_MARINE_API_URL',
      'OPEN_METEO_API_KEY',
      'WEATHER_API_CACHE_TTL_MS',
      'CITY_FORECAST_CACHE_TTL_MS',
      'GEOCODING_CACHE_TTL_MS',
    ])
      delete process.env[key];
    module = await Test.createTestingModule({
      providers: [OpenMeteoConfiguration],
    }).compile();
    config = module.get(OpenMeteoConfiguration);
  });
  afterEach(async () => {
    process.env = original;
    await module.close();
  });
  it('preserves the existing separate freshness durations for current, daily and geocoding queries', () => {
    expect(config.currentForecast().ttl).toBe(900000);
    expect(config.ttl('forecast')).toBe(3600000);
    expect(config.ttl('geocoding')).toBe(604800000);
  });
  it.each([
    'not-a-url',
    'http://example.invalid',
    'https://user:pass@example.invalid',
  ])('rejects invalid current forecast endpoints: %s', (url) => {
    process.env.OPEN_METEO_FORECAST_API_URL = url;
    expect(() => config.currentForecast()).toThrow();
  });
  it('requires credentials for customer endpoints and rejects free endpoint API-key usage', () => {
    process.env.OPEN_METEO_FORECAST_API_URL =
      'https://customer-api.open-meteo.com/v1/forecast';
    expect(() => config.currentForecast()).toThrow('must be set');
    expect(() => config.endpoints()).toThrow('required');
    process.env.OPEN_METEO_API_KEY = 'test-key';
    expect(config.currentForecast().apiKey).toBe('test-key');
    process.env.OPEN_METEO_FORECAST_API_URL =
      'https://api.open-meteo.com/v1/forecast';
    expect(() => config.currentForecast()).toThrow('customer or self-hosted');
  });
  it.each(['0', '-1', '1.5', 'invalid'])(
    'rejects invalid cache durations: %s',
    (ttl) => {
      process.env.WEATHER_API_CACHE_TTL_MS = ttl;
      expect(() => config.currentForecast()).toThrow('positive integer');
    },
  );
  it('rejects JSON endpoint credentials, query parameters and fragments', () => {
    for (const url of [
      'https://example.invalid?apikey=x',
      'https://example.invalid#fragment',
      'https://user:pass@example.invalid',
    ]) {
      process.env.OPEN_METEO_MARINE_API_URL = url;
      expect(() => config.endpoints()).toThrow();
    }
  });
});
