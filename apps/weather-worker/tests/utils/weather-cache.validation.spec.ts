import {
  validateCacheSignature,
  validateCacheWrite,
} from '../../src/utils/weather-cache.validation';

describe('Weather cache validation', () => {
  const input = () => ({
    query: { endpoint: 'https://example.invalid', parameters: {} },
    response: {},
    cachedAt: new Date(),
    expiresAt: new Date(Date.now() + 60000),
  });
  it.each([null, 1, 'invalid', 'A'.repeat(64)])(
    'rejects invalid SHA-256 query signatures: %s',
    (signature) => {
      expect(() => validateCacheSignature(signature)).toThrow('SHA-256');
    },
  );
  it('validates writes before database access while preserving error categories', () => {
    expect(() => validateCacheWrite(input())).not.toThrow();
    expect(() => validateCacheWrite({ ...input(), query: null })).toThrow(
      'without API credentials',
    );
    expect(() => validateCacheWrite({ ...input(), response: [] })).toThrow(
      'without API credentials',
    );
    expect(() =>
      validateCacheWrite({ ...input(), expiresAt: new Date(0) }),
    ).toThrow('valid future date');
  });
});
