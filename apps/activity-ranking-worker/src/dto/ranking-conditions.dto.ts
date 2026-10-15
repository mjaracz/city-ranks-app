import 'reflect-metadata';
import { Expose } from 'class-transformer';
import { IsNumber } from 'class-validator';

class WeatherRankingConditionsDto {
  @Expose()
  @IsNumber()
  windSpeedMaxKilometersPerHour: number;

  @Expose()
  @IsNumber()
  weatherCode: number;
}

class TemperatureRankingConditionsDto extends WeatherRankingConditionsDto {
  @Expose()
  @IsNumber()
  temperatureMinCelsius: number;

  @Expose()
  @IsNumber()
  temperatureMaxCelsius: number;
}

export class OutdoorRankingConditionsDto extends TemperatureRankingConditionsDto {
  @Expose()
  @IsNumber()
  precipitationMillimeters: number;
}

export class SkiingRankingConditionsDto extends TemperatureRankingConditionsDto {
  @Expose()
  @IsNumber()
  snowDepthMaxMeters: number;

  @Expose()
  @IsNumber()
  snowfallCentimeters: number;
}

export class SurfingRankingConditionsDto extends WeatherRankingConditionsDto {
  @Expose()
  @IsNumber()
  waveHeightMaxMeters: number;

  @Expose()
  @IsNumber()
  wavePeriodMaxSeconds: number;
}
