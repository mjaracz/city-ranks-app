import 'reflect-metadata';

import { Expose, Type } from 'class-transformer';
import { IsNumber, IsObject, Max, Min, ValidateNested } from 'class-validator';

export class WeatherCoordinatesDto {
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
}

export class WeatherCoordinatesInputDto {
  @Expose()
  @IsObject()
  @ValidateNested()
  @Type(() => WeatherCoordinatesDto)
  coordinates: WeatherCoordinatesDto;
}
