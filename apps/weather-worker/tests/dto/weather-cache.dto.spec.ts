import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  WeatherCacheWriteDto,
  WeatherCacheSignatureDto,
} from '../../src/dto/weather-cache.dto';
describe('Weather cache DTOs', () => {
  const input = () => ({
    query: {
      endpoint: 'https://example.invalid',
      parameters: { latitude: '0' },
    },
    response: {},
    cachedAt: new Date(),
    expiresAt: new Date(Date.now() + 60000),
  });
  it('accepts credential-free metadata, an object response and valid Date timestamps', () => {
    expect(
      validateSync(plainToInstance(WeatherCacheWriteDto, input())),
    ).toEqual([]);
    expect(
      validateSync(
        plainToInstance(WeatherCacheSignatureDto, {
          signature: 'a'.repeat(64),
        }),
      ),
    ).toEqual([]);
  });
  it.each([{ APIKEY: 'secret' }, { latitude: 0 }, []])(
    'rejects invalid or credential-bearing metadata: %p',
    (parameters) => {
      expect(
        validateSync(
          plainToInstance(WeatherCacheWriteDto, {
            ...input(),
            query: { endpoint: 'x', parameters },
          }),
        ).length,
      ).toBeGreaterThan(0);
    },
  );
  it.each([new Date(0), '2026-10-15', new Date(NaN)])(
    'requires a future Date for expiration: %p',
    (expiresAt) => {
      expect(
        validateSync(
          plainToInstance(WeatherCacheWriteDto, { ...input(), expiresAt }),
        ).length,
      ).toBeGreaterThan(0);
    },
  );
});
