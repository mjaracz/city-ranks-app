import { Injectable } from '@nestjs/common';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CityQueryError } from '@libs/contracts';

@Injectable()
export class WeatherInputValidator {
  tryTransform<T extends object>(
    type: ClassConstructor<T>,
    payload: unknown,
  ): T | null {
    try {
      const result = plainToInstance(type, payload, {
        excludeExtraneousValues: true,
        enableImplicitConversion: false,
      });
      return validateSync(result, {
        forbidUnknownValues: true,
        validationError: { target: false, value: false },
      }).length === 0
        ? result
        : null;
    } catch {
      return null;
    }
  }

  transform<T extends object>(type: ClassConstructor<T>, payload: unknown): T {
    const result = this.tryTransform(type, payload);
    if (!result)
      throw new CityQueryError(
        'UPSTREAM_UNAVAILABLE',
        'Open-Meteo returned an invalid response',
      );
    return result;
  }
}
