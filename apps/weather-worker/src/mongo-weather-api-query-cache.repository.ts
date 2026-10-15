import type { Collection } from 'mongodb';

import { Inject, Injectable } from '@nestjs/common';

import {
  WEATHER_API_CACHE_COLLECTION,
  WeatherApiCacheDocument,
} from './infrastructure/weather-mongo.providers';
import {
  validateCacheSignature,
  validateCacheWrite,
} from './utils/weather-cache.validation';
import {
  CachedWeatherApiResponse,
  WeatherApiQuery,
  WeatherApiQueryCacheRepository,
} from './weather-api-query-cache.repository';

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
    validateCacheSignature(querySignature);
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
    validateCacheSignature(querySignature);
    validateCacheWrite({ query, response, expiresAt, cachedAt });
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
