import { Inject, Injectable } from '@nestjs/common';
import type { Collection } from 'mongodb';
import {
  CachedWeatherApiResponse,
  WeatherApiQuery,
  WeatherApiQueryCacheRepository,
} from './weather-api-query-cache.repository';
import {
  WEATHER_API_CACHE_COLLECTION,
  WeatherApiCacheDocument,
} from './persistence/weather-mongo.providers';

function validateSignature(signature: string): void {
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) {
    throw new RangeError('Cache query signature must be a SHA-256 hex string');
  }
}

@Injectable()
export class MongoWeatherApiQueryCacheRepository extends WeatherApiQueryCacheRepository {
  constructor(
    @Inject(WEATHER_API_CACHE_COLLECTION)
    private readonly collection: Collection<WeatherApiCacheDocument>,
  ) {
    super();
  }

  async findFresh(
    querySignature: string,
  ): Promise<CachedWeatherApiResponse | null> {
    validateSignature(querySignature);
    const document = await this.collection.findOne({
      _id: querySignature,
      expiresAt: { $gt: new Date() },
    });
    return document
      ? {
          response: document.response,
          cachedAt: document.cachedAt,
          expiresAt: document.expiresAt,
        }
      : null;
  }

  async save(
    querySignature: string,
    query: WeatherApiQuery,
    response: Record<string, unknown>,
    expiresAt: Date,
    cachedAt = new Date(),
  ): Promise<void> {
    validateSignature(querySignature);
    if (
      !query ||
      typeof query.endpoint !== 'string' ||
      !query.parameters ||
      typeof query.parameters !== 'object' ||
      Array.isArray(query.parameters) ||
      Object.entries(query.parameters).some(
        ([key, value]) =>
          key.toLowerCase() === 'apikey' || typeof value !== 'string',
      ) ||
      !response ||
      typeof response !== 'object' ||
      Array.isArray(response)
    ) {
      throw new RangeError(
        'Cache query and response must be valid objects without API credentials',
      );
    }
    if (
      !(cachedAt instanceof Date) ||
      !Number.isFinite(cachedAt.getTime()) ||
      cachedAt.getTime() > Date.now() + 1000 ||
      !(expiresAt instanceof Date) ||
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt.getTime() <= Date.now()
    ) {
      throw new RangeError('Cache expiration must be a valid future date');
    }
    await this.collection.replaceOne(
      { _id: querySignature },
      {
        endpoint: query.endpoint,
        queryParameters: query.parameters,
        response,
        cachedAt,
        expiresAt,
      },
      { upsert: true },
    );
  }
}
