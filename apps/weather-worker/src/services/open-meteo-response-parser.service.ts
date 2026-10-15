import { MarineForecast } from '../domain/forecast-source';
import { CitySelectionPolicy } from '../domain/city-selection.policy';
import { DailySnowDepthPolicy } from '../domain/daily-snow-depth.policy';
import { WeatherInputValidator } from '../utils/weather-input.validator';
import { Injectable } from '@nestjs/common';
import { CityQueryError } from '@libs/contracts/city-query';
import { CityLocation, DailyWeatherForecast } from '@libs/models';
import {
  OpenMeteoCurrentResponseDto,
  OpenMeteoForecastResponseDto,
  OpenMeteoGeocodingResponseDto,
  OpenMeteoMarineResponseDto,
} from '../dto/open-meteo-response.dto';

@Injectable()
export class OpenMeteoResponseParser {
  constructor(
    private readonly validation: WeatherInputValidator,
    private readonly cities: CitySelectionPolicy,
    private readonly snow: DailySnowDepthPolicy,
  ) {}

  parseCity(payload: unknown): CityLocation {
    const response = this.validation.transform(
      OpenMeteoGeocodingResponseDto,
      payload,
    );
    const city = this.cities.select(response.results);
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
    const response = this.validation.transform(
      OpenMeteoForecastResponseDto,
      payload,
    );
    this.assertTimezone(response.timezone, timezone);
    const { daily, hourly } = response;
    return dates.map((date) => {
      const index = daily.time.indexOf(date);
      const snowDepthMaxMeters = this.snow.maximum({
        date,
        times: hourly.time,
        observations: hourly.snow_depth,
      });
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
    const response = this.validation.transform(
      OpenMeteoMarineResponseDto,
      payload,
    );
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
    return this.validation.transform(OpenMeteoCurrentResponseDto, payload);
  }

  private assertTimezone(actual: string, expected: string): void {
    if (actual !== expected)
      throw new CityQueryError(
        'UPSTREAM_UNAVAILABLE',
        'Unexpected forecast timezone',
      );
  }
}
