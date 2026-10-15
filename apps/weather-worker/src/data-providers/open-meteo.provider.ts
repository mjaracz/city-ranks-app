import type { CurrentWeather, WeatherCoordinates } from './open-meteo.types';

import { Injectable } from '@nestjs/common';

import { OpenMeteoCurrentResponseDto } from '../dto/open-meteo-response.dto';
import { OpenMeteoResponseParser } from '../services/open-meteo-response-parser.service';
import { validateWeatherCoordinates } from '../utils/weather-coordinates.validation';
import { WeatherApiQueryCacheRepository } from '../weather-api-query-cache.repository';

import { createOpenMeteoCurrentRequest } from './open-meteo-request';
import { OpenMeteoConfiguration } from './open-meteo.configuration';

@Injectable()
export class OpenMeteoProvider {
  private readonly forecastApiUrl: string;
  private readonly apiKey?: string;
  private readonly cacheTtlMilliseconds: number;
  private readonly inFlight = new Map<string, Promise<CurrentWeather>>();

  constructor(
    private readonly cache: WeatherApiQueryCacheRepository,
    private readonly parser: OpenMeteoResponseParser,
    configuration: OpenMeteoConfiguration,
  ) {
    const options = configuration.currentForecast();
    this.forecastApiUrl = options.url;
    this.apiKey = options.apiKey;
    this.cacheTtlMilliseconds = options.ttl;
  }

  async getCurrentWeather(
    coordinates: WeatherCoordinates,
  ): Promise<CurrentWeather> {
    validateWeatherCoordinates(coordinates);
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
      payload as Record<string, unknown>,
      new Date(Date.now() + this.cacheTtlMilliseconds),
    );
    return weather;
  }

  private mapCurrentWeather(
    payload: unknown,
    requestedCoordinates: WeatherCoordinates,
  ): CurrentWeather {
    let response: OpenMeteoCurrentResponseDto;
    try {
      response = this.parser.parseCurrent(payload);
    } catch {
      throw new OpenMeteoApiError('Open-Meteo returned an invalid response');
    }
    const current = response.current;
    const observedAt = current.time;
    const parsedTime = new Date(
      /(?:Z|[+-]\d{2}:?\d{2})$/i.test(observedAt)
        ? observedAt
        : observedAt + 'Z',
    );

    return {
      source: {
        name: 'Open-Meteo',
        attributionUrl: 'https://open-meteo.com/',
        license: 'CC BY 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      },
      requestedCoordinates: { ...requestedCoordinates },
      gridCoordinates: {
        latitude: response.latitude,
        longitude: response.longitude,
      },
      observedAt: parsedTime.toISOString(),
      temperatureCelsius: current.temperature_2m,
      relativeHumidityPercent: current.relative_humidity_2m,
      apparentTemperatureCelsius: current.apparent_temperature,
      precipitationMillimeters: current.precipitation,
      weatherCode: current.weather_code,
      windSpeedKilometersPerHour: current.wind_speed_10m,
      windDirectionDegrees: current.wind_direction_10m,
    };
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
