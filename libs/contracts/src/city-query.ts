export interface CityQuery {
  city: string;
}

export type CityQueryErrorCode =
  | 'INVALID_CITY'
  | 'CITY_NOT_FOUND'
  | 'UPSTREAM_UNAVAILABLE'
  | 'RANKING_UNAVAILABLE';

export type CityQueryResult<T> =
  | { status: 'OK'; result: T }
  | { status: 'ERROR'; code: CityQueryErrorCode; message: string };

export class CityQueryError extends Error {
  constructor(
    readonly code: CityQueryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CityQueryError';
  }
}

export function normalizeCity(city: unknown): string {
  if (typeof city !== 'string') {
    throw new CityQueryError('INVALID_CITY', 'City must be a string');
  }
  const normalized = city.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (normalized.length < 2 || normalized.length > 120) {
    throw new CityQueryError(
      'INVALID_CITY',
      'City must contain 2 to 120 characters',
    );
  }
  return normalized;
}

export function cityQueryFailure(error: unknown): CityQueryResult<never> {
  return error instanceof CityQueryError
    ? { status: 'ERROR', code: error.code, message: error.message }
    : {
        status: 'ERROR',
        code: 'RANKING_UNAVAILABLE',
        message: 'City ranking is temporarily unavailable',
      };
}
