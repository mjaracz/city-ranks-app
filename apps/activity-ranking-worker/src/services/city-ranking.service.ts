import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import {
  CityQueryError,
  CityQueryResult,
  normalizeCity,
} from '@libs/contracts/city-query';
import {
  WEATHER_CITY_FORECAST_QUERY,
  WEATHER_WORKER_CLIENT,
} from '@libs/contracts/message-patterns';
import { JetStreamEventStore } from '@libs/messaging/jetstream-event-store';
import { CityForecast, CityRanking, localDate } from '@libs/models';
import { CityRankingRepository } from '../city-ranking.repository';
import {
  calculateCityRanking,
  RANKING_POLICY_VERSION,
} from '../domain/ranking-policy';

@Injectable()
export class CityRankingService {
  private readonly inFlight = new Map<string, Promise<CityRanking>>();

  constructor(
    private readonly repository: CityRankingRepository,
    @Inject(WEATHER_WORKER_CLIENT) private readonly weather: ClientProxy,
    private readonly eventStore: JetStreamEventStore,
  ) {}

  async getRanking(input: string, refresh = false): Promise<CityRanking> {
    const city = normalizeCity(input);
    const queryKey = city.toLowerCase();
    if (!refresh) {
      const stored = await this.repository.findFresh(
        queryKey,
        RANKING_POLICY_VERSION,
      );
      const isStoredRankingCurrent =
        stored &&
        stored.windowStartDate === localDate(new Date(), stored.city.timezone);
      if (isStoredRankingCurrent) return stored;
    }
    const pending = this.inFlight.get(queryKey);
    if (pending) return pending;
    const request = this.compute(city, queryKey);
    this.inFlight.set(queryKey, request);
    try {
      return await request;
    } finally {
      this.inFlight.delete(queryKey);
    }
  }

  private async compute(city: string, queryKey: string): Promise<CityRanking> {
    let response: CityQueryResult<CityForecast>;
    try {
      response = await firstValueFrom(
        this.weather
          .send<CityQueryResult<CityForecast>>(WEATHER_CITY_FORECAST_QUERY, {
            city,
          })
          .pipe(timeout(35_000)),
      );
    } catch {
      throw new CityQueryError(
        'UPSTREAM_UNAVAILABLE',
        'Weather worker is temporarily unavailable',
      );
    }
    if (response?.status === 'ERROR')
      throw new CityQueryError(response.code, response.message);
    if (response?.status !== 'OK')
      throw new CityQueryError(
        'UPSTREAM_UNAVAILABLE',
        'Invalid weather worker response',
      );
    const ranking = calculateCityRanking(response.result);
    const existing = await this.repository.findById(ranking.id);
    if (existing) {
      await this.repository.save(queryKey, existing);
      return existing;
    }
    await this.eventStore.append({
      eventId: `${ranking.id}:city-ranking-computed`,
      eventType: 'city-ranking-computed',
      schemaVersion: 1,
      occurredAt: ranking.computedAt,
      correlationId: ranking.forecastSnapshotId,
      causationId: `${ranking.forecastSnapshotId}:forecast-snapshot-accepted`,
      payload: ranking,
    });
    await this.repository.save(queryKey, ranking);
    return ranking;
  }
}
