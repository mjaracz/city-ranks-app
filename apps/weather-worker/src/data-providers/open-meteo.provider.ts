import { Injectable } from '@nestjs/common';

@Injectable()
export class OpenMeteoProvider {
  private static readonly currentWeatherConfiguration = {
    timeoutMilliseconds: 10_000,
    queryParameters: {
      current: [
        'temperature_2m',
        'relative_humidity_2m',
        'apparent_temperature',
        'precipitation',
        'weather_code',
        'wind_speed_10m',
        'wind_direction_10m',
      ].join(','),
      temperature_unit: 'celsius',
      wind_speed_unit: 'kmh',
      precipitation_unit: 'mm',
      timezone: 'UTC',
      timeformat: 'iso8601',
    },
  } as const;

  private readonly configuration = this.loadConfiguration();

  async getCurrentWeather(
    coordinates: OpenMeteoProvider.Coordinates,
  ): Promise<OpenMeteoProvider.CurrentWeather> {
    this.validateCoordinates(coordinates);

    const url = new URL(this.configuration.forecastApiUrl);
    url.searchParams.set('latitude', String(coordinates.latitude));
    url.searchParams.set('longitude', String(coordinates.longitude));

    for (const [parameter, value] of Object.entries(
      OpenMeteoProvider.currentWeatherConfiguration.queryParameters,
    )) {
      url.searchParams.set(parameter, value);
    }

    if (this.configuration.apiKey) {
      url.searchParams.set('apikey', this.configuration.apiKey);
    }

    let payload: unknown;
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(
          OpenMeteoProvider.currentWeatherConfiguration.timeoutMilliseconds,
        ),
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

      if (typeof error === 'object' && error !== null && 'name' in error) {
        switch (error.name) {
          case 'TimeoutError':
            throw new OpenMeteoApiError('Open-Meteo request timed out');
          case 'SyntaxError':
            throw new OpenMeteoApiError('Open-Meteo returned invalid JSON');
        }
      }

      throw new OpenMeteoApiError('Open-Meteo request failed');
    }

    return this.mapCurrentWeather(payload, coordinates);
  }

  private loadConfiguration(
    environment: NodeJS.ProcessEnv = process.env,
  ): OpenMeteoProvider.Configuration {
    const configuredUrl =
      environment.OPEN_METEO_FORECAST_API_URL?.trim() ||
      'https://api.open-meteo.com/v1/forecast';
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(configuredUrl);
    } catch {
      throw new Error('OPEN_METEO_FORECAST_API_URL must be a valid URL');
    }

    const isForecastApiUrlInvalid =
      parsedUrl.protocol !== 'https:' ||
      parsedUrl.username !== '' ||
      parsedUrl.password !== '';

    if (isForecastApiUrlInvalid) {
      throw new Error(
        'OPEN_METEO_FORECAST_API_URL must be an HTTPS URL without credentials',
      );
    }

    const apiKey = environment.OPEN_METEO_API_KEY?.trim() || undefined;
    const isFreeOpenMeteoEndpoint = parsedUrl.hostname === 'api.open-meteo.com';

    if (apiKey && isFreeOpenMeteoEndpoint) {
      throw new Error(
        'OPEN_METEO_API_KEY requires a customer or self-hosted forecast endpoint',
      );
    }

    if (parsedUrl.hostname === 'customer-api.open-meteo.com' && !apiKey) {
      throw new Error(
        'OPEN_METEO_API_KEY must be set for the Open-Meteo customer endpoint',
      );
    }

    return { forecastApiUrl: parsedUrl.toString(), apiKey };
  }

  private validateCoordinates(
    coordinates: OpenMeteoProvider.Coordinates,
  ): void {
    if (typeof coordinates !== 'object' || coordinates === null) {
      throw new RangeError('coordinates must be an object');
    }

    const isLatitudeInvalid =
      !Number.isFinite(coordinates.latitude) ||
      coordinates.latitude < -90 ||
      coordinates.latitude > 90;

    if (isLatitudeInvalid) {
      throw new RangeError('latitude must be a number between -90 and 90');
    }

    const isLongitudeInvalid =
      !Number.isFinite(coordinates.longitude) ||
      coordinates.longitude < -180 ||
      coordinates.longitude > 180;

    if (isLongitudeInvalid) {
      throw new RangeError('longitude must be a number between -180 and 180');
    }
  }

  private mapCurrentWeather(
    payload: unknown,
    requestedCoordinates: OpenMeteoProvider.Coordinates,
  ): OpenMeteoProvider.CurrentWeather {
    const response = this.requireRecord(payload, 'response');
    const current = this.requireRecord(response.current, 'current');
    const observedAt = this.requireString(current.time, 'current.time');
    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(observedAt);
    const parsedTime = new Date(hasTimezone ? observedAt : `${observedAt}Z`);

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
        modifications:
          'Field names normalized; observation time converted to UTC.',
      },
      requestedCoordinates: {
        latitude: requestedCoordinates.latitude,
        longitude: requestedCoordinates.longitude,
      },
      gridCoordinates: {
        latitude: this.requireNumber(response.latitude, 'latitude'),
        longitude: this.requireNumber(response.longitude, 'longitude'),
      },
      elevationMeters: this.requireNumber(response.elevation, 'elevation'),
      timezone: this.requireString(response.timezone, 'timezone'),
      timezoneAbbreviation: this.requireString(
        response.timezone_abbreviation,
        'timezone_abbreviation',
      ),
      utcOffsetSeconds: this.requireNumber(
        response.utc_offset_seconds,
        'utc_offset_seconds',
      ),
      observedAt: parsedTime.toISOString(),
      observationIntervalSeconds: this.requireNumber(
        current.interval,
        'current.interval',
      ),
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
    const isRecordInvalid =
      typeof value !== 'object' || value === null || Array.isArray(value);

    if (isRecordInvalid) {
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

export declare namespace OpenMeteoProvider {
  interface Coordinates {
    latitude: number;
    longitude: number;
  }

  interface Configuration {
    readonly forecastApiUrl: string;
    readonly apiKey?: string;
  }

  interface CurrentWeather {
    source: {
      name: 'Open-Meteo';
      attributionUrl: 'https://open-meteo.com/';
      license: 'CC BY 4.0';
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/';
      modifications: 'Field names normalized; observation time converted to UTC.';
    };
    requestedCoordinates: Coordinates;
    gridCoordinates: Coordinates;
    elevationMeters: number;
    timezone: string;
    timezoneAbbreviation: string;
    utcOffsetSeconds: number;
    observedAt: string;
    observationIntervalSeconds: number;
    temperatureCelsius: number;
    relativeHumidityPercent: number;
    apparentTemperatureCelsius: number;
    precipitationMillimeters: number;
    weatherCode: number;
    windSpeedKilometersPerHour: number;
    windDirectionDegrees: number;
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
