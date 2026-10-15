import { Injectable } from '@nestjs/common';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { isObject, validateSync } from 'class-validator';
import { CityQueryError } from '../../../../libs/contracts/src/city-query';
import { CityForecast, CityLocation, DailyWeatherForecast } from '@libs/models';
import { ForecastSnapshotDto } from '../dto/forecast-snapshot.dto';
import {
  OpenMeteoCurrentResponseDto,
  OpenMeteoForecastResponseDto,
  OpenMeteoGeocodingResponseDto,
  OpenMeteoMarineResponseDto,
} from '../dto/open-meteo-response.dto';

export interface MarineForecast {
  latitude: number;
  longitude: number;
  days: { height: number | null; period: number | null }[];
}

@Injectable()
export class OpenMeteoResponseParser {
  parseCity(payload: unknown): CityLocation {
    const response = this.transform(OpenMeteoGeocodingResponseDto, payload);
    if (!response.results?.length)
      throw new CityQueryError(
        'CITY_NOT_FOUND',
        'No matching city was found; try adding a country or region',
      );
    // BQ-02: Use the first Open-Meteo match and return its identity for disambiguation.
    const city = response.results[0];
    return {
      id: 'open-meteo:' + city.id,
      name: city.name,
      countryCode: city.country_code,
      country: city.country,
      region: city.admin1 ?? null,
      latitude: city.latitude,
      longitude: city.longitude,
      timezone: city.timezone,
    };
  }

  parseWeather(
    payload: unknown,
    dates: string[],
    timezone: string,
  ): DailyWeatherForecast[] {
    const response = this.transform(OpenMeteoForecastResponseDto, payload);
    this.assertTimezone(response.timezone, timezone);
    const { daily, hourly } = response;
    return dates.map((date) => {
      const index = daily.time.indexOf(date);
      const hourlyValues = hourly.time.flatMap((time, i) =>
        time.startsWith(date + 'T') ? [hourly.snow_depth[i]] : [],
      );
      // BQ-05: A daily snow-depth maximum requires all 24 model hours to be present.
      const snowDepthMaxMeters =
        hourlyValues.length === 24 &&
        hourlyValues.every((value) => value !== null)
          ? Math.max(...(hourlyValues as number[]))
          : null;
      return {
        date,
        temperatureMinCelsius: daily.temperature_2m_min[index] ?? null,
        temperatureMaxCelsius: daily.temperature_2m_max[index] ?? null,
        precipitationMillimeters: daily.precipitation_sum[index] ?? null,
        snowfallCentimeters: daily.snowfall_sum[index] ?? null,
        windSpeedMaxKilometersPerHour: daily.wind_speed_10m_max[index] ?? null,
        weatherCode: daily.weather_code[index] ?? null,
        snowDepthMaxMeters,
        waveHeightMaxMeters: null,
        wavePeriodMaxSeconds: null,
      };
    });
  }

  parseMarine(
    payload: unknown,
    dates: string[],
    timezone: string,
  ): MarineForecast {
    const response = this.transform(OpenMeteoMarineResponseDto, payload);
    this.assertTimezone(response.timezone, timezone);
    return {
      latitude: response.latitude,
      longitude: response.longitude,
      days: dates.map((date) => {
        const index = response.daily.time.indexOf(date);
        return {
          height: response.daily.wave_height_max[index] ?? null,
          period: response.daily.wave_period_max[index] ?? null,
        };
      }),
    };
  }

  parseCurrent(payload: unknown): OpenMeteoCurrentResponseDto {
    return this.transform(OpenMeteoCurrentResponseDto, payload);
  }

  assertSnapshot(forecast: CityForecast): void {
    this.transform(ForecastSnapshotDto, forecast);
  }

  private transform<T extends object>(
    type: ClassConstructor<T>,
    payload: unknown,
  ): T {
    try {
      if (!isObject(payload)) throw new Error('Invalid response object');
      const response = plainToInstance(type, payload, {
        excludeExtraneousValues: true,
        enableImplicitConversion: false,
      });
      const errors = validateSync(response, {
        forbidUnknownValues: true,
        validationError: { target: false, value: false },
      });
      if (errors.length) throw new Error('Invalid response fields');
      return response;
    } catch {
      throw new CityQueryError(
        'UPSTREAM_UNAVAILABLE',
        'Open-Meteo returned an invalid response',
      );
    }
  }

  private assertTimezone(actual: string, expected: string): void {
    if (actual !== expected)
      throw new CityQueryError(
        'UPSTREAM_UNAVAILABLE',
        'Unexpected forecast timezone',
      );
  }
}
