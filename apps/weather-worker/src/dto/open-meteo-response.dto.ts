import { Expose, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsTimeZone,
  Matches,
  Max,
  Min,
  Validate,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { WMO_WEATHER_CODES } from '@libs/models';

import {
  MatchingTimeSeriesLength,
  NullableNumberRange,
  OrderedTemperatureRange,
} from '../utils/open-meteo.constraints';

export class OpenMeteoCityDto {
  @Expose()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  id: number;

  @Expose()
  @IsString()
  @Matches(/\S/)
  name: string;

  @Expose()
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  country_code: string;

  @Expose()
  @IsString()
  @Matches(/\S/)
  country: string;

  @Expose()
  @IsOptional()
  @IsString()
  admin1?: string | null;

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

export class OpenMeteoGeocodingResponseDto {
  @Expose()
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpenMeteoCityDto)
  results?: OpenMeteoCityDto[];
}

export class OpenMeteoDailyDatesDto {
  @Expose()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(16)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true })
  @IsDateString({ strict: true }, { each: true })
  time: string[];
}

export class OpenMeteoWeatherDailyDto extends OpenMeteoDailyDatesDto {
  @Expose()
  @IsArray()
  @Validate(MatchingTimeSeriesLength)
  @Validate(NullableNumberRange, [-100, 70], { each: true })
  temperature_2m_min: (number | null)[];

  @Expose()
  @IsArray()
  @Validate(MatchingTimeSeriesLength)
  @Validate(NullableNumberRange, [-100, 70], { each: true })
  @Validate(OrderedTemperatureRange)
  temperature_2m_max: (number | null)[];

  @Expose()
  @IsArray()
  @Validate(MatchingTimeSeriesLength)
  @Validate(NullableNumberRange, [0, 3000], { each: true })
  precipitation_sum: (number | null)[];

  @Expose()
  @IsArray()
  @Validate(MatchingTimeSeriesLength)
  @Validate(NullableNumberRange, [0, 1000], { each: true })
  snowfall_sum: (number | null)[];

  @Expose()
  @IsArray()
  @Validate(MatchingTimeSeriesLength)
  @Validate(NullableNumberRange, [0, 500], { each: true })
  wind_speed_10m_max: (number | null)[];

  @Expose()
  @IsArray()
  @Validate(MatchingTimeSeriesLength)
  @IsIn([null, ...WMO_WEATHER_CODES], { each: true })
  weather_code: (number | null)[];
}

export class OpenMeteoSnowHourlyDto {
  @Expose()
  @IsArray()
  @ArrayMaxSize(400)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):00$/, { each: true })
  @IsDateString({ strict: true }, { each: true })
  time: string[];

  @Expose()
  @IsArray()
  @Validate(MatchingTimeSeriesLength)
  @Validate(NullableNumberRange, [0, 100], { each: true })
  snow_depth: (number | null)[];
}

export class OpenMeteoForecastResponseDto {
  @Expose()
  @IsString()
  @IsTimeZone()
  timezone: string;

  @Expose()
  @IsObject()
  @ValidateNested()
  @Type(() => OpenMeteoWeatherDailyDto)
  daily: OpenMeteoWeatherDailyDto;

  @Expose()
  @IsObject()
  @ValidateNested()
  @Type(() => OpenMeteoSnowHourlyDto)
  hourly: OpenMeteoSnowHourlyDto;
}

export class OpenMeteoMarineDailyDto extends OpenMeteoDailyDatesDto {
  @Expose()
  @IsArray()
  @Validate(MatchingTimeSeriesLength)
  @Validate(NullableNumberRange, [0, 100], { each: true })
  wave_height_max: (number | null)[];

  @Expose()
  @IsArray()
  @Validate(MatchingTimeSeriesLength)
  @Validate(NullableNumberRange, [0, 100], { each: true })
  wave_period_max: (number | null)[];
}

export class OpenMeteoMarineResponseDto {
  @Expose()
  @IsString()
  @IsTimeZone()
  timezone: string;

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
  @IsObject()
  @ValidateNested()
  @Type(() => OpenMeteoMarineDailyDto)
  daily: OpenMeteoMarineDailyDto;
}

export class OpenMeteoCurrentDto {
  @Expose()
  @IsString()
  @IsDateString({ strict: true })
  time: string;

  @Expose()
  @IsNumber()
  temperature_2m: number;

  @Expose()
  @IsNumber()
  relative_humidity_2m: number;

  @Expose()
  @IsNumber()
  apparent_temperature: number;

  @Expose()
  @IsNumber()
  precipitation: number;

  @Expose()
  @IsNumber()
  @IsIn([...WMO_WEATHER_CODES])
  weather_code: number;

  @Expose()
  @IsNumber()
  wind_speed_10m: number;

  @Expose()
  @IsNumber()
  wind_direction_10m: number;
}

export class OpenMeteoCurrentResponseDto {
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
  @IsObject()
  @ValidateNested()
  @Type(() => OpenMeteoCurrentDto)
  current: OpenMeteoCurrentDto;
}
