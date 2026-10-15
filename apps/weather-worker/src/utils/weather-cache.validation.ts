import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  WeatherCacheSignatureDto,
  WeatherCacheWriteDto,
} from '../dto/weather-cache.dto';

export function validateCacheSignature(signature: unknown): void {
  const errors = validateSync(
    plainToInstance(
      WeatherCacheSignatureDto,
      { signature },
      { enableImplicitConversion: false },
    ),
  );
  if (errors.length)
    throw new RangeError('Cache query signature must be a SHA-256 hex string');
}

export function validateCacheWrite(input: object): void {
  const errors = validateSync(
    plainToInstance(WeatherCacheWriteDto, input, {
      enableImplicitConversion: false,
    }),
  );
  if (
    errors.some(
      (error) => error.property === 'query' || error.property === 'response',
    )
  ) {
    throw new RangeError(
      'Cache query and response must be valid objects without API credentials',
    );
  }
  if (errors.length)
    throw new RangeError('Cache expiration must be a valid future date');
}
