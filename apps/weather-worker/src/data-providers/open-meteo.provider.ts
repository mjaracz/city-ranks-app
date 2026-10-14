import { Injectable } from '@nestjs/common';
import { WeatherApiQueryCacheRepository } from '../weather-api-query-cache.repository';
import { createOpenMeteoCurrentRequest } from './open-meteo-request';
import type { CurrentWeather, WeatherCoordinates } from './open-meteo.types';

@Injectable()
export class OpenMeteoProvider {
  private readonly forecastApiUrl: string;
  private readonly apiKey?: string;
  private readonly cacheTtlMilliseconds: number;
  private readonly inFlight = new Map<string, Promise<CurrentWeather>>();

  constructor(private readonly cache: WeatherApiQueryCacheRepository) {
    const configuredUrl =
      process.env.OPEN_METEO_FORECAST_API_URL?.trim() ||
      'https://api.open-meteo.com/v1/forecast';
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(configuredUrl);
    } catch {
      throw new Error('OPEN_METEO_FORECAST_API_URL must be a valid URL');
    }

    if (
      parsedUrl.protocol !== 'https:' ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      throw new Error(
        'OPEN_METEO_FORECAST_API_URL must be an HTTPS URL without credentials',
      );
    }

    this.apiKey = process.env.OPEN_METEO_API_KEY?.trim() || undefined;
    if (this.apiKey && parsedUrl.hostname === 'api.open-meteo.com') {
      throw new Error(
        'OPEN_METEO_API_KEY requires a customer or self-hosted forecast endpoint',
      );
    }
    if (parsedUrl.hostname === 'customer-api.open-meteo.com' && !this.apiKey) {
      throw new Error(
        'OPEN_METEO_API_KEY must be set for the customer endpoint',
      );
    }

    this.forecastApiUrl = parsedUrl.toString();
    this.cacheTtlMilliseconds = this.getCacheTtlMilliseconds();
  }

  async getCurrentWeather(
    coordinates: WeatherCoordinates,
  ): Promise<CurrentWeather> {
    this.validateCoordinates(coordinates);
    const { query, signature, requestUrl } = createOpenMeteoCurrentRequest(
      this.forecastApiUrl,
      coordinates,
      this.apiKey,
    );
    const cached = await this.cache.findFresh(signature);

    if (cached) {
      return this.mapCurrentWeather(cached.response, coordinates);
    }

    if (process.env.WEATHER_API_CACHE_ONLY === 'true') {
      throw new OpenMeteoApiError(
        'Weather cache miss; upstream requests are disabled',
      );
    }

    const existingRequest = this.inFlight.get(signature);
    if (existingRequest) {
      return existingRequest;
    }

    const request = this.fetchAndCache(
      requestUrl,
      query,
      signature,
      coordinates,
    );
    this.inFlight.set(signature, request);

    try {
      return await request;
    } finally {
      this.inFlight.delete(signature);
    }
  }

  private async fetchAndCache(
    requestUrl: URL,
    query: { endpoint: string; parameters: Record<string, string> },
    signature: string,
    coordinates: WeatherCoordinates,
  ): Promise<CurrentWeather> {
    let payload: unknown;

    try {
      const response = await fetch(requestUrl, {
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        throw new OpenMeteoApiError(
          `Open-Meteo request failed with HTTP ${response.status}`,
          response.status,
        );
      }

      payload = await response.json();
    } catch (error) {
      if (error instanceof OpenMeteoApiError) {
        throw error;
      }
      if (error instanceof SyntaxError) {
        throw new OpenMeteoApiError('Open-Meteo returned invalid JSON');
      }
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new OpenMeteoApiError('Open-Meteo request timed out');
      }
      throw new OpenMeteoApiError('Open-Meteo request failed');
    }

    const weather = this.mapCurrentWeather(payload, coordinates);
    await this.cache.save(
      signature,
      query,
      this.requireRecord(payload, 'response'),
      new Date(Date.now() + this.cacheTtlMilliseconds),
    );
    return weather;
  }

  private getCacheTtlMilliseconds(): number {
    const configuredTtl = process.env.WEATHER_API_CACHE_TTL_MS;
    const ttl = configuredTtl === undefined ? 900_000 : Number(configuredTtl);

    if (!Number.isSafeInteger(ttl) || ttl <= 0) {
      throw new Error('WEATHER_API_CACHE_TTL_MS must be a positive integer');
    }

    return ttl;
  }

  private validateCoordinates(coordinates: WeatherCoordinates): void {
    if (typeof coordinates !== 'object' || coordinates === null) {
      throw new RangeError('coordinates must be an object');
    }
    if (
      !Number.isFinite(coordinates.latitude) ||
      coordinates.latitude < -90 ||
      coordinates.latitude > 90
    ) {
      throw new RangeError('latitude must be a number between -90 and 90');
    }
    if (
      !Number.isFinite(coordinates.longitude) ||
      coordinates.longitude < -180 ||
      coordinates.longitude > 180
    ) {
      throw new RangeError('longitude must be a number between -180 and 180');
    }
  }

  private mapCurrentWeather(
    payload: unknown,
    requestedCoordinates: WeatherCoordinates,
  ): CurrentWeather {
    const response = this.requireRecord(payload, 'response');
    const current = this.requireRecord(response.current, 'current');
    const observedAt = this.requireString(current.time, 'current.time');
    const parsedTime = new Date(
      /(?:Z|[+-]\d{2}:?\d{2})$/i.test(observedAt)
        ? observedAt
        : `${observedAt}Z`,
    );

    if (!Number.isFinite(parsedTime.getTime())) {
      throw new OpenMeteoApiError(
        'Open-Meteo returned an invalid observation time',
      );
    }

    return {
      source: {
        name: 'Open-Meteo',
        attributionUrl: 'https://open-meteo.com/',
        license: 'CC BY 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      },
      requestedCoordinates: { ...requestedCoordinates },
      gridCoordinates: {
        latitude: this.requireNumber(response.latitude, 'latitude'),
        longitude: this.requireNumber(response.longitude, 'longitude'),
      },
      observedAt: parsedTime.toISOString(),
      temperatureCelsius: this.requireNumber(
        current.temperature_2m,
        'current.temperature_2m',
      ),
      relativeHumidityPercent: this.requireNumber(
        current.relative_humidity_2m,
        'current.relative_humidity_2m',
      ),
      apparentTemperatureCelsius: this.requireNumber(
        current.apparent_temperature,
        'current.apparent_temperature',
      ),
      precipitationMillimeters: this.requireNumber(
        current.precipitation,
        'current.precipitation',
      ),
      weatherCode: this.requireNumber(
        current.weather_code,
        'current.weather_code',
      ),
      windSpeedKilometersPerHour: this.requireNumber(
        current.wind_speed_10m,
        'current.wind_speed_10m',
      ),
      windDirectionDegrees: this.requireNumber(
        current.wind_direction_10m,
        'current.wind_direction_10m',
      ),
    };
  }

  private requireRecord(
    value: unknown,
    field: string,
  ): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new OpenMeteoApiError(
        `Open-Meteo returned an invalid ${field} value`,
      );
    }
    return value as Record<string, unknown>;
  }

  private requireNumber(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new OpenMeteoApiError(
        `Open-Meteo returned an invalid ${field} value`,
      );
    }
    return value;
  }

  private requireString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.length === 0) {
      throw new OpenMeteoApiError(
        `Open-Meteo returned an invalid ${field} value`,
      );
    }
    return value;
  }
}

export class OpenMeteoApiError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'OpenMeteoApiError';
  }
}
