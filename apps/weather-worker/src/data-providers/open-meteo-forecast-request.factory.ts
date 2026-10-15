import { Injectable } from '@nestjs/common';

import { CityLocation } from '@libs/models';

@Injectable()
export class OpenMeteoForecastRequestFactory {
  geocoding(city: string): Record<string, string> {
    return {
      name: city.toLowerCase(),
      count: '1',
      language: 'en',
      format: 'json',
    };
  }

  weather(
    city: CityLocation,
    dates: readonly string[],
  ): Record<string, string> {
    return {
      ...this.window(city, dates),
      daily:
        'temperature_2m_min,temperature_2m_max,precipitation_sum,snowfall_sum,wind_speed_10m_max,weather_code',
      hourly: 'snow_depth',
      temperature_unit: 'celsius',
      wind_speed_unit: 'kmh',
      precipitation_unit: 'mm',
    };
  }

  marine(city: CityLocation, dates: readonly string[]): Record<string, string> {
    return {
      ...this.window(city, dates),
      daily: 'wave_height_max,wave_period_max',
      cell_selection: 'sea',
      length_unit: 'metric',
    };
  }

  private window(
    city: CityLocation,
    dates: readonly string[],
  ): Record<string, string> {
    return {
      latitude: String(city.latitude),
      longitude: String(city.longitude),
      timezone: city.timezone,
      start_date: dates[0],
      end_date: dates[6],
      timeformat: 'iso8601',
    };
  }
}
