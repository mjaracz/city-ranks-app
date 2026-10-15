import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { ActivityEvaluation, CityForecast } from '@libs/models';

import {
  DailyRankingInputDto,
  ForecastRankingInputDto,
} from '../dto/ranking-policy.dto';

export function toValidatedRankingInput<T extends object>(
  dtoClass: ClassConstructor<T>,
  input: unknown,
): T | null {
  try {
    const dto = plainToInstance(dtoClass, input, {
      excludeExtraneousValues: true,
      enableImplicitConversion: false,
    });
    const errors = validateSync(dto, {
      forbidUnknownValues: true,
      validationError: { target: false, value: false },
    });
    return errors.length === 0 ? dto : null;
  } catch {
    return null;
  }
}

export function validateRankingForecast(forecast: CityForecast): void {
  if (!toValidatedRankingInput(ForecastRankingInputDto, forecast)) {
    throw new RangeError('A city forecast must contain seven days');
  }
}

export function validateRankingEvaluations(
  evaluations: ActivityEvaluation[],
): void {
  if (!toValidatedRankingInput(DailyRankingInputDto, { evaluations })) {
    throw new RangeError(
      'Each day requires four distinct supported activities with finite ranked scores between 0 and 100, or null score and rank when unavailable',
    );
  }
}
