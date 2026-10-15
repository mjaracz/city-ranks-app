import { Inject, Injectable } from '@nestjs/common';
import type { Db } from 'mongodb';
import { WEATHER_MONGO_DATABASE } from '../infrastructure/weather-mongo.providers';

@Injectable()
export class WeatherDatabaseHealth {
  constructor(@Inject(WEATHER_MONGO_DATABASE) private readonly database: Db) {}

  async isAvailable(): Promise<boolean> {
    try {
      await this.database.command({ ping: 1 });
      return true;
    } catch {
      return false;
    }
  }
}
