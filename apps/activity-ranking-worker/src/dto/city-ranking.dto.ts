import 'reflect-metadata';
import { Expose, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsString,
  IsTimeZone,
  Matches,
  Max,
  Min,
  Validate,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  Activity,
  ActivityEvaluation,
  CityLocation,
  CityRanking,
  Completeness,
  DailyCityRanking,
  EvaluationState,
} from '../../../../libs/models/src';
import {
  DailyRankingConsistency,
  RankingCompleteness,
  RankingWindow,
} from '../validation/ranking.constraints';

export class RankingCityLocationDto implements CityLocation {
  @Expose()
  @IsString()
  @Matches(/\S/)
  id: string;

  @Expose()
  @IsString()
  @Matches(/\S/)
  name: string;

  @Expose()
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode: string;

  @Expose()
  @IsString()
  @Matches(/\S/)
  country: string;

  @Expose()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  region: string | null;

  @Expose()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @Expose()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @Expose()
  @IsString()
  @IsTimeZone()
  timezone: string;
}

export class ActivityEvaluationDto implements ActivityEvaluation {
  @Expose()
  @IsEnum(Activity)
  activity: Activity;

  @Expose()
  @IsEnum(EvaluationState)
  state: EvaluationState;

  @Expose()
  @ValidateIf((_object, value) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  score: number | null;

  @Expose()
  @ValidateIf((_object, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(4)
  rank: number | null;

  @Expose()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @Matches(/\S/, { each: true })
  reasonCodes: string[];

  @Expose()
  @IsString()
  @Matches(/\S/)
  explanation: string;
}

export class DailyCityRankingDto implements DailyCityRanking {
  @Expose()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  date: string;

  @Expose()
  @IsEnum(Completeness)
  completeness: Completeness;

  @Expose()
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @ArrayUnique((item: ActivityEvaluation) => item?.activity)
  @ValidateNested({ each: true })
  @Validate(DailyRankingConsistency)
  @Type(() => ActivityEvaluationDto)
  activities: ActivityEvaluationDto[];
}

export class CityRankingDto implements CityRanking {
  @Expose()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  id: string;

  @Expose()
  @IsObject()
  @ValidateNested()
  @Type(() => RankingCityLocationDto)
  city: RankingCityLocationDto;

  @Expose()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  windowStartDate: string;

  @Expose()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  windowEndDate: string;

  @Expose()
  @IsEnum(Completeness)
  @Validate(RankingCompleteness)
  completeness: Completeness;

  @Expose()
  @IsString()
  @Matches(/\S/)
  policyVersion: string;

  @Expose()
  @IsString()
  @Matches(/\S/)
  forecastSnapshotId: string;

  @Expose()
  @IsString()
  @IsDateString({ strict: true })
  weatherFetchedAt: string;

  @Expose()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @IsDateString({ strict: true })
  marineFetchedAt: string | null;

  @Expose()
  @IsString()
  @IsDateString({ strict: true })
  freshUntil: string;

  @Expose()
  @IsString()
  @IsDateString({ strict: true })
  computedAt: string;

  @Expose()
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Validate(RankingWindow)
  @Type(() => DailyCityRankingDto)
  days: DailyCityRankingDto[];
}
