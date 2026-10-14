import { MongoClient } from 'mongodb';
import {
  getPositiveInteger,
  getWeatherMongoConfiguration,
} from '../../../../libs/config/src/environment';

export const WEATHER_MONGO_CLIENT = Symbol('WEATHER_MONGO_CLIENT');
export const WEATHER_MONGO_DATABASE = Symbol('WEATHER_MONGO_DATABASE');
export const WEATHER_API_CACHE_COLLECTION = Symbol(
  'WEATHER_API_CACHE_COLLECTION',
);

export interface WeatherApiCacheDocument {
  _id: string;
  endpoint: string;
  queryParameters: Record<string, string>;
  response: Record<string, unknown>;
  cachedAt: Date;
  expiresAt: Date;
}

export function createWeatherMongoClient(): MongoClient {
  return new MongoClient(getWeatherMongoConfiguration().uri, {
    appName: 'weather-worker',
    maxPoolSize: getPositiveInteger('WEATHER_DB_POOL_MAX', 10),
    minPoolSize: 0,
    serverSelectionTimeoutMS: 5000,
    waitQueueTimeoutMS: 5000,
    writeConcern: { w: 1, j: true },
  });
}
