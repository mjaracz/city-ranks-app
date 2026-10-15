import type { Collection, Db } from 'mongodb';

import {
  Inject,
  Injectable,
  Module,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { MongoClient } from 'mongodb';

import { getWeatherMongoConfiguration } from '@libs/config/environment';

import {
  createWeatherMongoClient,
  WEATHER_API_CACHE_COLLECTION,
  WEATHER_MONGO_CLIENT,
  WEATHER_MONGO_DATABASE,
  WeatherApiCacheDocument,
} from './weather-mongo.providers';

@Injectable()
class WeatherDatabaseLifecycle implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(WEATHER_MONGO_CLIENT) private readonly client: MongoClient,
    @Inject(WEATHER_API_CACHE_COLLECTION)
    private readonly collection: Collection<WeatherApiCacheDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
      await this.collection.createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0, name: 'cache_expiry_ttl' },
      );
    } catch (error) {
      await this.client.close();
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }
}

@Module({
  providers: [
    { provide: WEATHER_MONGO_CLIENT, useFactory: createWeatherMongoClient },
    {
      provide: WEATHER_MONGO_DATABASE,
      inject: [WEATHER_MONGO_CLIENT],
      useFactory: (client: MongoClient) =>
        client.db(getWeatherMongoConfiguration().database),
    },
    {
      provide: WEATHER_API_CACHE_COLLECTION,
      inject: [WEATHER_MONGO_DATABASE],
      useFactory: (database: Db) =>
        database.collection<WeatherApiCacheDocument>('weather_api_query_cache'),
    },
    WeatherDatabaseLifecycle,
  ],
  exports: [WEATHER_MONGO_DATABASE, WEATHER_API_CACHE_COLLECTION],
})
export class WeatherDatabaseModule {}
