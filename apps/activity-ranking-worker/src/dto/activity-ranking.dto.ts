import 'reflect-metadata';

import type {
  ActivityFactor,
  ActivityRanking,
  ActivityType,
} from '../activity-ranking.repository';

import { Expose, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDate,
  IsDateString,
  IsIn,
  IsNumber,
  IsObject,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import {
  RankingPeriodLength,
  ScalarActivityFactors,
} from '../utils/activity-ranking.constraints';

const cityMessage = 'City must contain 1 to 120 characters';
const dateMessage = 'Ranking dates must use valid YYYY-MM-DD values';
const scoreMessage = 'Ranking activity or score is invalid';
const timestampMessage = 'Ranking timestamps must be valid dates';

export class ActivityRankingCityDto {
  @Expose()
  @IsString({ message: cityMessage })
  @Matches(/\S/, { message: cityMessage })
  @MaxLength(120, { message: cityMessage })
  city: string;
}

export class ActivityRankingPeriodDto extends ActivityRankingCityDto {
  @Expose()
  @IsString({ message: dateMessage })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: dateMessage })
  @IsDateString({ strict: true }, { message: dateMessage })
  from: string;

  @Expose()
  @IsString({ message: dateMessage })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: dateMessage })
  @IsDateString({ strict: true }, { message: dateMessage })
  @Validate(RankingPeriodLength)
  until: string;
}

export class ActivityRankingDto
  extends ActivityRankingCityDto
  implements ActivityRanking
{
  @Expose()
  @IsIn(['skiing', 'surfing', 'outdoor-sightseeing', 'indoor-sightseeing'], {
    message: scoreMessage,
  })
  activity: ActivityType;

  @Expose()
  @IsString({ message: dateMessage })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: dateMessage })
  @IsDateString({ strict: true }, { message: dateMessage })
  forecastDate: string;

  @Expose()
  @IsNumber({}, { message: scoreMessage })
  @Min(0, { message: scoreMessage })
  @Max(100, { message: scoreMessage })
  score: number;

  @Expose()
  @IsObject({ message: 'Ranking factors must be an object' })
  @Validate(ScalarActivityFactors)
  factors: ActivityFactor;

  @Expose()
  @ValidateIf((_object, value) => value !== null)
  @IsDate({ message: timestampMessage })
  weatherUpdatedAt: Date | null;

  @Expose()
  @IsDate({ message: timestampMessage })
  calculatedAt: Date;
}

export class ActivityRankingBatchDto {
  @Expose()
  @IsArray({ message: 'A ranking batch must contain at most 1000 records' })
  @ArrayMaxSize(1000, {
    message: 'A ranking batch must contain at most 1000 records',
  })
  @IsObject({ each: true, message: 'Invalid ranking record' })
  @ValidateNested({ each: true })
  @Type(() => ActivityRankingDto)
  rankings: ActivityRankingDto[];
}
