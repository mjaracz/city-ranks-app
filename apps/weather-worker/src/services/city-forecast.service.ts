import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  CityQueryError,
  normalizeCity,
} from '../../../../libs/contracts/src/city-query';
import { addCalendarDays, CityForecast, localDate } from '@libs/models';
import { JetStreamEventStore } from '../../../../libs/messaging/src/jetstream-event-store';
import {
  OpenMeteoJsonClient,
  PersistedResponse,
} from '../data-providers/open-meteo-json.client';
import {
  MarineForecast,
  OpenMeteoResponseParser,
} from './open-meteo-response-parser.service';

const dailyFields = [
  'temperature_2m_min',
  'temperature_2m_max',
  'precipitation_sum',
  'snowfall_sum',
  'wind_speed_10m_max',
  'weather_code',
] as const;

@Injectable()
export class CityForecastService {
  constructor(
    private readonly client: OpenMeteoJsonClient,
    private readonly eventStore: JetStreamEventStore,
    private readonly parser: OpenMeteoResponseParser,
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
      (payload) => this.parser.parseCity(payload),
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
        daily: dailyFields.join(','),
        hourly: 'snow_depth',
        temperature_unit: 'celsius',
        wind_speed_unit: 'kmh',
        precipitation_unit: 'mm',
      },
      (payload) => this.parser.parseWeather(payload, dates, city.timezone),
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
        (payload) => this.parser.parseMarine(payload, dates, city.timezone),
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
    this.parser.assertSnapshot(forecast);
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
