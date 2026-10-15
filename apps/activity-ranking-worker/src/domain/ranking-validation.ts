import { plainToInstance } from 'class-transformer';
import { isObject, validateSync } from 'class-validator';
import type { CityRanking } from '../../../../libs/models/src';
import { CityRankingDto } from '../dto/city-ranking.dto';

export function validateCityRanking(
  ranking: unknown,
): asserts ranking is CityRanking {
  try {
    if (!isObject(ranking)) throw new RangeError();
    const dto = plainToInstance(CityRankingDto, ranking, {
      excludeExtraneousValues: true,
      enableImplicitConversion: false,
    });
    const errors = validateSync(dto, {
      forbidUnknownValues: true,
      validationError: { target: false, value: false },
    });
    if (errors.length) throw new RangeError();
  } catch {
    throw new RangeError('Invalid complete city ranking');
  }
}
