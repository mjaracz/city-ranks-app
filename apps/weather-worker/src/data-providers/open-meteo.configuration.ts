import { Injectable } from '@nestjs/common';

import { getPositiveInteger } from '@libs/config';

export type OpenMeteoEndpoint = 'geocoding' | 'forecast' | 'marine';

@Injectable()
export class OpenMeteoConfiguration {
  currentForecast(): { url: string; apiKey?: string; ttl: number } {
    const configured =
      process.env.OPEN_METEO_FORECAST_API_URL?.trim() ||
      'https://api.open-meteo.com/v1/forecast';
    let url: URL;
    try {
      url = new URL(configured);
    } catch {
      throw new Error('OPEN_METEO_FORECAST_API_URL must be a valid URL');
    }
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error(
        'OPEN_METEO_FORECAST_API_URL must be an HTTPS URL without credentials',
      );
    }
    const apiKey = process.env.OPEN_METEO_API_KEY?.trim() || undefined;
    if (apiKey && url.hostname === 'api.open-meteo.com')
      throw new Error(
        'OPEN_METEO_API_KEY requires a customer or self-hosted forecast endpoint',
      );
    if (url.hostname === 'customer-api.open-meteo.com' && !apiKey)
      throw new Error(
        'OPEN_METEO_API_KEY must be set for the customer endpoint',
      );
    return {
      url: url.toString(),
      apiKey,
      ttl: getPositiveInteger('WEATHER_API_CACHE_TTL_MS', 900_000),
    };
  }

  endpoints(): Record<OpenMeteoEndpoint, URL> {
    return {
      geocoding: this.endpoint(
        'OPEN_METEO_GEOCODING_API_URL',
        'https://geocoding-api.open-meteo.com/v1/search',
      ),
      forecast: this.endpoint(
        'OPEN_METEO_FORECAST_API_URL',
        'https://api.open-meteo.com/v1/forecast',
      ),
      marine: this.endpoint(
        'OPEN_METEO_MARINE_API_URL',
        'https://marine-api.open-meteo.com/v1/marine',
      ),
    };
  }

  ttl(kind: OpenMeteoEndpoint): number {
    // BQ-08: Forecasts are fresh for one hour, location resolution for seven days.
    return kind === 'geocoding'
      ? getPositiveInteger('GEOCODING_CACHE_TTL_MS', 604_800_000)
      : getPositiveInteger('CITY_FORECAST_CACHE_TTL_MS', 3_600_000);
  }

  private endpoint(key: string, fallback: string): URL {
    const url = new URL(process.env[key]?.trim() || fallback);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        key +
          ' must be an HTTPS endpoint without credentials or query parameters',
      );
    }
    if (
      url.hostname.startsWith('customer-') &&
      !process.env.OPEN_METEO_API_KEY?.trim()
    ) {
      throw new Error('OPEN_METEO_API_KEY is required for ' + key);
    }
    return url;
  }
}
