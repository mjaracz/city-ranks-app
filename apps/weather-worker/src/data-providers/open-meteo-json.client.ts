import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { isObject } from 'class-validator';
import { getPositiveInteger } from '../../../../libs/config/src/environment';
import { CityQueryError } from '../../../../libs/contracts/src/city-query';
import { WeatherApiQueryCacheRepository } from '../weather-api-query-cache.repository';

export type OpenMeteoEndpoint = 'geocoding' | 'forecast' | 'marine';
export interface PersistedResponse<T> {
  value: T;
  fetchedAt: Date;
  freshUntil: Date;
}

@Injectable()
export class OpenMeteoJsonClient {
  // BQ-08: Forecasts are fresh for one hour, location resolution for seven days.
  readonly forecastTtl = getPositiveInteger(
    'CITY_FORECAST_CACHE_TTL_MS',
    3_600_000,
  );
  readonly geocodingTtl = getPositiveInteger(
    'GEOCODING_CACHE_TTL_MS',
    604_800_000,
  );
  private readonly endpoints: Record<OpenMeteoEndpoint, URL>;
  private readonly inFlight = new Map<
    string,
    Promise<PersistedResponse<unknown>>
  >();

  constructor(private readonly cache: WeatherApiQueryCacheRepository) {
    this.endpoints = {
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

  async get<T>(
    kind: OpenMeteoEndpoint,
    parameters: Record<string, string>,
    parse: (payload: unknown) => T,
  ): Promise<PersistedResponse<T>> {
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
    if (pending) return pending as Promise<PersistedResponse<T>>;
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
  ): Promise<PersistedResponse<T>> {
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

  private endpoint(key: string, fallback: string): URL {
    const url = new URL(process.env[key]?.trim() || fallback);
    const isInvalidEndpointUrl =
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash;
    if (isInvalidEndpointUrl)
      throw new Error(
        `${key} must be an HTTPS endpoint without credentials or query parameters`,
      );
    const isCustomerEndpointMissingApiKey =
      url.hostname.startsWith('customer-') &&
      !process.env.OPEN_METEO_API_KEY?.trim();
    if (isCustomerEndpointMissingApiKey)
      throw new Error(`OPEN_METEO_API_KEY is required for ${key}`);
    return url;
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
