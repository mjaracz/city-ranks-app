import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import type { ActivityRanking } from '../activity-ranking.repository';
import {
  ActivityRankingBatchDto,
  ActivityRankingCityDto,
  ActivityRankingPeriodDto,
} from '../dto/activity-ranking.dto';

export function validateCity(city: unknown): asserts city is string {
  validateDto(ActivityRankingCityDto, { city });
}

export function validateRankingPeriod(
  city: unknown,
  from: unknown,
  until: unknown,
): void {
  validateDto(ActivityRankingPeriodDto, { city, from, until });
}

export function validateRankings(
  rankings: unknown,
): asserts rankings is readonly ActivityRanking[] {
  validateDto(ActivityRankingBatchDto, { rankings });
}

function validateDto<T extends object>(
  type: ClassConstructor<T>,
  payload: object,
): void {
  try {
    const dto = plainToInstance(type, payload, {
      excludeExtraneousValues: true,
      enableImplicitConversion: false,
    });
    const errors = validateSync(dto, {
      forbidUnknownValues: true,
      validationError: { target: false, value: false },
    });
    if (errors.length) throw new RangeError(validationMessages(errors)[0]);
  } catch (error) {
    if (error instanceof RangeError) throw error;
    throw new RangeError('Invalid activity ranking data');
  }
}

function validationMessages(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...validationMessages(error.children ?? []),
  ]);
}
