import { Module } from '@nestjs/common';
import { MongoWeatherApiQueryCacheRepository } from '../mongo-weather-api-query-cache.repository';
import { WeatherApiQueryCacheRepository } from '../weather-api-query-cache.repository';
import { WeatherDatabaseModule } from './weather-database.module';

@Module({
  imports: [WeatherDatabaseModule],
  providers: [
    {
      provide: WeatherApiQueryCacheRepository,
      useClass: MongoWeatherApiQueryCacheRepository,
    },
  ],
  exports: [WeatherApiQueryCacheRepository, WeatherDatabaseModule],
})
export class WeatherPersistenceModule {}
