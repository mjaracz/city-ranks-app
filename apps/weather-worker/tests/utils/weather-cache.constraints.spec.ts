import { jest } from '@jest/globals';

import {
  CacheExpiry,
  CacheParameters,
  CacheWriteTime,
} from '../../src/utils/weather-cache.constraints';

describe('Weather cache rules', () => {
  afterEach(() => jest.restoreAllMocks());
  it('rejects API keys regardless of capitalization and requires string query values', () => {
    const rule = new CacheParameters();
    expect(rule.validate({ latitude: '0' })).toBe(true);
    for (const value of [null, [], { apiKey: 'secret' }, { latitude: 0 }])
      expect(rule.validate(value)).toBe(false);
  });
  it('requires strictly future expiry and permits at most one second of clock skew on writes', () => {
    jest.spyOn(Date, 'now').mockReturnValue(10000);
    const expiry = new CacheExpiry(),
      written = new CacheWriteTime();
    expect(expiry.validate(new Date(10000))).toBe(false);
    expect(expiry.validate(new Date(10001))).toBe(true);
    expect(written.validate(new Date(11000))).toBe(true);
    expect(written.validate(new Date(11001))).toBe(false);
    expect(written.validate(new Date(NaN))).toBe(false);
  });
});
