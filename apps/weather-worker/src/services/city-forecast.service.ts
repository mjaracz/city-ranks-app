import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  CityQueryError,
  normalizeCity,
} from '../../../../libs/contracts/src/city-query';
import {
  addCalendarDays,
  CityForecast,
  CityLocation,
  DailyWeatherForecast,
  isCalendarDate,
  localDate,
  WMO_WEATHER_CODES,
} from '../../../../libs/models/src';
import { JetStreamEventStore } from '../../../../libs/messaging/src/jetstream-event-store';
import {
  numberOrNull,
  OpenMeteoJsonClient,
  PersistedResponse,
  record,
} from '../data-providers/open-meteo-json.client';

const fields = {
  temperatureMinCelsius: ['temperature_2m_min', -100, 70],
  temperatureMaxCelsius: ['temperature_2m_max', -100, 70],
  precipitationMillimeters: ['precipitation_sum', 0, 3000],
  snowfallCentimeters: ['snowfall_sum', 0, 1000],
  windSpeedMaxKilometersPerHour: ['wind_speed_10m_max', 0, 500],
  weatherCode: ['weather_code', 0, 99],
} as const;

@Injectable()
export class CityForecastService {
  constructor(
    private readonly client: OpenMeteoJsonClient,
    private readonly eventStore: JetStreamEventStore,
  ) {}

  async getForecast(input: string): Promise<CityForecast> {
    const cityName = normalizeCity(input);
    const geocoding = await this.client.get(
      'geocoding',
      {
        name: cityName.toLowerCase(),
        count: '1',
        language: 'en',
        format: 'json',
      },
      parseCity,
    );
    const city = geocoding.value;
    // BQ-01: The seven-day window includes today in the resolved city's timezone.
    const start = localDate(new Date(), city.timezone);
    const dates = Array.from({ length: 7 }, (_, index) =>
      addCalendarDays(start, index),
    );
    const parameters = {
      latitude: String(city.latitude),
      longitude: String(city.longitude),
      timezone: city.timezone,
      start_date: dates[0],
      end_date: dates[6],
      timeformat: 'iso8601',
    };
    const weather = await this.client.get(
      'forecast',
      {
        ...parameters,
        daily: Object.values(fields)
          .map(([name]) => name)
          .join(','),
        hourly: 'snow_depth',
        temperature_unit: 'celsius',
        wind_speed_unit: 'kmh',
        precipitation_unit: 'mm',
      },
      (payload) => parseWeather(payload, dates, city.timezone),
    );
    let marine: PersistedResponse<MarineForecast> | null = null;
    try {
      marine = await this.client.get(
        'marine',
        {
          ...parameters,
          daily: 'wave_height_max,wave_period_max',
          cell_selection: 'sea',
          length_unit: 'metric',
        },
        (payload) => parseMarine(payload, dates, city.timezone),
      );
    } catch (error) {
      const isNotAnUpstreamAvailabilityError =
        !(error instanceof CityQueryError) ||
        error.code !== 'UPSTREAM_UNAVAILABLE';
      if (isNotAnUpstreamAvailabilityError) throw error;
    }
    const hasMarine =
      marine?.value.days.some(
        (day) => day.height !== null && day.period !== null,
      ) ?? false;
    // BQ-06: Surfing is in scope only when an observed marine grid is within 50 km.
    const outsideCity =
      hasMarine && distanceKilometers(city, marine!.value) > 50;
    const marineStatus: CityForecast['marineStatus'] = outsideCity
      ? 'NOT_APPLICABLE'
      : hasMarine
        ? 'AVAILABLE'
        : 'INSUFFICIENT_DATA';
    const days = weather.value.map((day, index) => ({
      ...day,
      waveHeightMaxMeters: marine?.value.days[index].height ?? null,
      wavePeriodMaxSeconds: marine?.value.days[index].period ?? null,
    }));
    const weatherFetchedAt = weather.fetchedAt.toISOString();
    const marineFetchedAt = marine?.fetchedAt.toISOString() ?? null;
    const freshUntil = new Date(
      Math.min(
        weather.freshUntil.getTime(),
        marine?.freshUntil.getTime() ?? Infinity,
      ),
    ).toISOString();
    const snapshotId = createHash('sha256')
      .update(
        JSON.stringify({
          city,
          weatherFetchedAt,
          marineFetchedAt,
          marineStatus,
          days,
        }),
      )
      .digest('hex');
    const forecast: CityForecast = {
      snapshotId,
      city,
      weatherFetchedAt,
      marineFetchedAt,
      freshUntil,
      marineStatus,
      days,
    };
    await this.eventStore.append({
      eventId: `${snapshotId}:forecast-snapshot-accepted`,
      eventType: 'forecast-snapshot-accepted',
      schemaVersion: 1,
      occurredAt: weatherFetchedAt,
      correlationId: snapshotId,
      payload: forecast,
    });
    return forecast;
  }
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    throw new CityQueryError(
      'UPSTREAM_UNAVAILABLE',
      'Open-Meteo returned invalid location metadata',
    );
  return value;
}

export function parseCity(payload: unknown): CityLocation {
  const response = record(payload);
  const hasNoCityMatches =
    response.results === undefined ||
    (Array.isArray(response.results) && response.results.length === 0);
  if (hasNoCityMatches)
    throw new CityQueryError(
      'CITY_NOT_FOUND',
      'No matching city was found; try adding a country or region',
    );
  if (!Array.isArray(response.results))
    throw new CityQueryError(
      'UPSTREAM_UNAVAILABLE',
      'Invalid geocoding response',
    );
  // BQ-02: Use the first Open-Meteo match and return its identity for disambiguation.
  const city = record(response.results[0]);
  const latitude = numberOrNull(city.latitude, -90, 90);
  const longitude = numberOrNull(city.longitude, -180, 180);
  const hasInvalidCityCoordinatesOrIdentity =
    latitude === null ||
    longitude === null ||
    !Number.isSafeInteger(city.id) ||
    Number(city.id) <= 0;
  if (hasInvalidCityCoordinatesOrIdentity)
    throw new CityQueryError(
      'UPSTREAM_UNAVAILABLE',
      'Invalid geocoding coordinates or identity',
    );
  const timezone = requiredString(city.timezone);
  try {
    localDate(new Date(), timezone);
  } catch {
    throw new CityQueryError('UPSTREAM_UNAVAILABLE', 'Invalid city timezone');
  }
  const countryCode = requiredString(city.country_code);
  if (!/^[A-Z]{2}$/.test(countryCode))
    throw new CityQueryError(
      'UPSTREAM_UNAVAILABLE',
      'Invalid city country code',
    );
  return {
    id: `open-meteo:${city.id}`,
    name: requiredString(city.name),
    countryCode,
    country: requiredString(city.country),
    region: typeof city.admin1 === 'string' ? city.admin1 : null,
    latitude,
    longitude,
    timezone,
  };
}

function timeSeries(
  payload: unknown,
  timezone: string,
): {
  response: Record<string, unknown>;
  daily: Record<string, unknown>;
  times: string[];
} {
  const response = record(payload);
  if (response.timezone !== timezone)
    throw new CityQueryError(
      'UPSTREAM_UNAVAILABLE',
      'Unexpected forecast timezone',
    );
  const daily = record(response.daily);
  const hasInvalidDailyForecastDates =
    !Array.isArray(daily.time) ||
    daily.time.length === 0 ||
    daily.time.length > 16 ||
    !daily.time.every(isCalendarDate) ||
    new Set(daily.time).size !== daily.time.length;
  if (hasInvalidDailyForecastDates)
    throw new CityQueryError(
      'UPSTREAM_UNAVAILABLE',
      'Invalid daily forecast dates',
    );
  return { response, daily, times: daily.time as string[] };
}

function column(
  daily: Record<string, unknown>,
  name: string,
  count: number,
  min: number,
  max = Infinity,
): (number | null)[] {
  const values = daily[name];
  if (!Array.isArray(values) || values.length !== count)
    throw new CityQueryError(
      'UPSTREAM_UNAVAILABLE',
      'Invalid daily forecast measurements',
    );
  return values.map((value) => numberOrNull(value, min, max));
}

export function parseWeather(
  payload: unknown,
  dates: string[],
  timezone: string,
): DailyWeatherForecast[] {
  const { response, daily, times } = timeSeries(payload, timezone);
  const columns = Object.fromEntries(
    Object.entries(fields).map(([key, [name, min, max]]) => [
      key,
      column(daily, name, times.length, min, max),
    ]),
  );
  const hourly = record(response.hourly);
  const hasInvalidHourlySnowObservations =
    !Array.isArray(hourly.time) ||
    !Array.isArray(hourly.snow_depth) ||
    hourly.time.length !== hourly.snow_depth.length ||
    hourly.time.length > 400 ||
    new Set(hourly.time).size !== hourly.time.length ||
    !hourly.time.every(
      (value) =>
        typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):00$/.test(value) &&
        isCalendarDate(value.slice(0, 10)),
    );
  if (hasInvalidHourlySnowObservations)
    throw new CityQueryError(
      'UPSTREAM_UNAVAILABLE',
      'Invalid hourly snow observations',
    );
  const snow = (hourly.snow_depth as unknown[]).map((value) =>
    numberOrNull(value, 0, 100),
  );
  return dates.map((date) => {
    const index = times.indexOf(date);
    const values = Object.fromEntries(
      Object.keys(fields).map((key) => [
        key,
        index < 0 ? null : columns[key][index],
      ]),
    );
    const hasInvalidTemperatureRange =
      values.temperatureMinCelsius !== null &&
      values.temperatureMaxCelsius !== null &&
      values.temperatureMinCelsius > values.temperatureMaxCelsius;
    if (hasInvalidTemperatureRange)
      throw new CityQueryError(
        'UPSTREAM_UNAVAILABLE',
        'Minimum temperature exceeds maximum',
      );
    const hasInvalidWeatherCode =
      values.weatherCode !== null && !WMO_WEATHER_CODES.has(values.weatherCode);
    if (hasInvalidWeatherCode)
      throw new CityQueryError(
        'UPSTREAM_UNAVAILABLE',
        'Invalid WMO weather code',
      );
    const hourlyValues = (hourly.time as string[]).flatMap((time, i) =>
      time.startsWith(`${date}T`) ? [snow[i]] : [],
    );
    // BQ-05: A daily snow-depth maximum requires all 24 model hours to be present.
    const snowDepthMaxMeters =
      hourlyValues.length === 24 &&
      hourlyValues.every((value) => value !== null)
        ? Math.max(...(hourlyValues as number[]))
        : null;
    return {
      date,
      ...values,
      snowDepthMaxMeters,
      waveHeightMaxMeters: null,
      wavePeriodMaxSeconds: null,
    } as DailyWeatherForecast;
  });
}

interface MarineForecast {
  latitude: number;
  longitude: number;
  days: { height: number | null; period: number | null }[];
}

export function parseMarine(
  payload: unknown,
  dates: string[],
  timezone: string,
): MarineForecast {
  const { response, daily, times } = timeSeries(payload, timezone);
  const latitude = numberOrNull(response.latitude, -90, 90);
  const longitude = numberOrNull(response.longitude, -180, 180);
  if (latitude === null || longitude === null)
    throw new CityQueryError(
      'UPSTREAM_UNAVAILABLE',
      'Invalid marine grid coordinates',
    );
  const height = column(daily, 'wave_height_max', times.length, 0, 100);
  const period = column(daily, 'wave_period_max', times.length, 0, 100);
  return {
    latitude,
    longitude,
    days: dates.map((date) => {
      const index = times.indexOf(date);
      return {
        height: index < 0 ? null : height[index],
        period: index < 0 ? null : period[index],
      };
    }),
  };
}

function distanceKilometers(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const radians = (value: number) => (value * Math.PI) / 180;
  const angle =
    Math.sin(radians(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(radians(b.longitude - a.longitude) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, angle)));
}
