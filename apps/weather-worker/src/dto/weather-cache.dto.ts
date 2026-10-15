import 'reflect-metadata';

import { Expose, Type } from 'class-transformer';
import {
  IsDate,
  IsObject,
  IsString,
  Matches,
  Validate,
  ValidateNested,
} from 'class-validator';

import {
  CacheExpiry,
  CacheParameters,
  CacheWriteTime,
} from '../utils/weather-cache.constraints';

export class WeatherCacheSignatureDto {
  @Expose()
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  signature: string;
}

export class WeatherCacheQueryDto {
  @Expose()
  @IsString()
  endpoint: string;

  @Expose()
  @IsObject()
  @Validate(CacheParameters)
  parameters: Record<string, string>;
}

export class WeatherCacheWriteDto {
  @Expose()
  @IsObject()
  @ValidateNested()
  @Type(() => WeatherCacheQueryDto)
  query: WeatherCacheQueryDto;

  @Expose()
  @IsObject()
  response: Record<string, unknown>;

  @Expose()
  @IsDate()
  @Validate(CacheWriteTime)
  cachedAt: Date;

  @Expose()
  @IsDate()
  @Validate(CacheExpiry)
  expiresAt: Date;
}
