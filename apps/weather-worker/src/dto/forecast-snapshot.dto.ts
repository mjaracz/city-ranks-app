import type { CityLocation, DailyWeatherForecast } from '@libs/models';

import { Expose } from 'class-transformer';
import {
  Allow,
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  Validate,
  ValidateIf,
} from 'class-validator';

import {
  CurrentForecastWindow,
  NonFutureTimestamp,
  UnexpiredTimestamp,
} from '../utils/open-meteo.constraints';

export class ForecastSnapshotDto {
  @Expose()
  @Allow()
  city: CityLocation;

  @Expose()
  @IsDateString({ strict: true })
  @Validate(NonFutureTimestamp)
  weatherFetchedAt: string;

  @Expose()
  @ValidateIf((_object, value) => value !== null)
  @IsDateString({ strict: true })
  marineFetchedAt: string | null;

  @Expose()
  @IsDateString({ strict: true })
  @Validate(UnexpiredTimestamp)
  freshUntil: string;

  @Expose()
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @Validate(CurrentForecastWindow)
  days: DailyWeatherForecast[];
}
