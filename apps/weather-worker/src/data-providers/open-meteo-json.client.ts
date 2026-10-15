import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { isObject } from 'class-validator';

import { CityQueryError } from '@libs/contracts/city-query';

import { ForecastSource } from '../domain/forecast-source';
import { WeatherApiQueryCacheRepository } from '../weather-api-query-cache.repository';

import {
  OpenMeteoConfiguration,
  OpenMeteoEndpoint,
} from './open-meteo.configuration';

@Injectable()
export class OpenMeteoJsonClient {
  readonly forecastTtl: number;
  readonly geocodingTtl: number;
  private readonly endpoints: Record<OpenMeteoEndpoint, URL>;
  private readonly inFlight = new Map<
    string,
    Promise<ForecastSource<unknown>>
  >();

  constructor(
    private readonly cache: WeatherApiQueryCacheRepository,
    configuration: OpenMeteoConfiguration,
  ) {
    this.endpoints = configuration.endpoints();
    this.forecastTtl = configuration.ttl('forecast');
    this.geocodingTtl = configuration.ttl('geocoding');
  }

  async get<T>(
    kind: OpenMeteoEndpoint,
    parameters: Record<string, string>,
    parse: (payload: unknown) => T,
  ): Promise<ForecastSource<T>> {
    const url = new URL(this.endpoints[kind]);
    for (const [key, value] of Object.entries(parameters))
      url.searchParams.set(key, value);
    url.searchParams.delete('apikey');
    url.searchParams.sort();
    const query = {
      endpoint: `${url.origin}${url.pathname}`,
      parameters: Object.fromEntries(url.searchParams.entries()),
    };
    const signature = createHash('sha256')
      .update(JSON.stringify(query))
      .digest('hex');
    const ttl = kind === 'geocoding' ? this.geocodingTtl : this.forecastTtl;
    const cached = await this.cache.findFresh(signature);
    if (cached)
      return {
        value: parse(cached.response),
        fetchedAt: cached.cachedAt,
        freshUntil: new Date(
          Math.min(
            cached.cachedAt.getTime() + ttl,
            cached.expiresAt?.getTime() ?? Infinity,
          ),
        ),
      };
    if (process.env.WEATHER_API_CACHE_ONLY === 'true')
      throw new CityQueryError(
        'UPSTREAM_UNAVAILABLE',
        'Required forecast is not present in the weather cache',
      );
    const pending = this.inFlight.get(signature);
    if (pending) return pending as Promise<ForecastSource<T>>;
    if (url.hostname.startsWith('customer-') && process.env.OPEN_METEO_API_KEY)
      url.searchParams.set('apikey', process.env.OPEN_METEO_API_KEY.trim());
    const request = this.fetchAndCache(url, signature, query, ttl, parse);
    this.inFlight.set(signature, request);
    try {
      return await request;
    } finally {
      this.inFlight.delete(signature);
    }
  }

  private async fetchAndCache<T>(
    url: URL,
    signature: string,
    query: { endpoint: string; parameters: Record<string, string> },
    ttl: number,
    parse: (payload: unknown) => T,
  ): Promise<ForecastSource<T>> {
    let payload: unknown;
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error('Upstream HTTP error');
      payload = await response.json();
    } catch {
      throw new CityQueryError(
        'UPSTREAM_UNAVAILABLE',
        'Open-Meteo is temporarily unavailable',
      );
    }
    const value = parse(payload);
    const fetchedAt = new Date();
    const freshUntil = new Date(fetchedAt.getTime() + ttl);
    await this.cache.save(
      signature,
      query,
      record(payload),
      freshUntil,
      fetchedAt,
    );
    return { value, fetchedAt, freshUntil };
  }
}

export function record(value: unknown): Record<string, unknown> {
  if (!isObject(value))
    throw new CityQueryError(
      'UPSTREAM_UNAVAILABLE',
      'Open-Meteo returned an invalid response',
    );
  return value as Record<string, unknown>;
}
