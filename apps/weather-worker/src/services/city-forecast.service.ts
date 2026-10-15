import { Injectable } from '@nestjs/common';
import { CityQueryError, normalizeCity } from '@libs/contracts';
import { CityForecast } from '@libs/models';
import { JetStreamEventStore } from '@libs/messaging';
import { OpenMeteoJsonClient } from '../data-providers/open-meteo-json.client';
import { OpenMeteoForecastRequestFactory } from '../data-providers/open-meteo-forecast-request.factory';
import { ForecastSource, MarineForecast } from '../domain/forecast-source';
import { ForecastSnapshotFactory } from '../domain/forecast-snapshot.factory';
import { ForecastWindowPolicy } from '../domain/forecast-window.policy';
import { OpenMeteoResponseParser } from './open-meteo-response-parser.service';

@Injectable()
export class CityForecastService {
  constructor(
    private readonly client: OpenMeteoJsonClient,
    private readonly eventStore: JetStreamEventStore,
    private readonly parser: OpenMeteoResponseParser,
    private readonly window: ForecastWindowPolicy,
    private readonly snapshots: ForecastSnapshotFactory,
    private readonly requests: OpenMeteoForecastRequestFactory,
  ) {}

  async getForecast(input: string): Promise<CityForecast> {
    const cityName = normalizeCity(input);
    const geocoding = await this.client.get(
      'geocoding',
      this.requests.geocoding(cityName),
      (payload) => this.parser.parseCity(payload),
    );
    const city = geocoding.value;
    const dates = this.window.dates(city.timezone);
    const weather = await this.client.get(
      'forecast',
      this.requests.weather(city, dates),
      (payload) => this.parser.parseWeather(payload, dates, city.timezone),
    );
    let marine: ForecastSource<MarineForecast> | null = null;
    try {
      marine = await this.client.get(
        'marine',
        this.requests.marine(city, dates),
        (payload) => this.parser.parseMarine(payload, dates, city.timezone),
      );
    } catch (error) {
      if (
        !(error instanceof CityQueryError) ||
        error.code !== 'UPSTREAM_UNAVAILABLE'
      )
        throw error;
    }
    const forecast = this.snapshots.create({ city, weather, marine });
    await this.eventStore.append({
      eventId: forecast.snapshotId + ':forecast-snapshot-accepted',
      eventType: 'forecast-snapshot-accepted',
      schemaVersion: 1,
      occurredAt: forecast.weatherFetchedAt,
      correlationId: forecast.snapshotId,
      payload: forecast,
    });
    return forecast;
  }
}
