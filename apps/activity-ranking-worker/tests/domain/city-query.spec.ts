import {
  CityQueryError,
  cityQueryFailure,
  normalizeCity,
} from '@libs/contracts/city-query';

describe('city query contract', () => {
  it('normalizes whitespace and canonical Unicode before resolving a city', () => {
    expect(normalizeCity('  Gdan\u0301sk   Bay  ')).toBe('Gdańsk Bay');
  });

  it('requires a bounded, non-empty city name', () => {
    for (const value of [undefined, null, 42, '', ' ', 'a', 'x'.repeat(121)]) {
      expect(() => normalizeCity(value)).toThrow(CityQueryError);
    }
  });

  it('converts expected domain errors to stable response envelopes', () => {
    expect(
      cityQueryFailure(new CityQueryError('CITY_NOT_FOUND', 'Missing')),
    ).toEqual({
      status: 'ERROR',
      code: 'CITY_NOT_FOUND',
      message: 'Missing',
    });
  });

  it('hides unexpected internal errors behind an unavailable response', () => {
    expect(cityQueryFailure(new Error('private database detail'))).toEqual({
      status: 'ERROR',
      code: 'RANKING_UNAVAILABLE',
      message: 'City ranking is temporarily unavailable',
    });
  });
});
