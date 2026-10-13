import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { getRequiredDatabaseUrl } from '../../../libs/config/src/environment';

@Injectable()
export class WeatherDatabaseHealth implements OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString: getRequiredDatabaseUrl('WEATHER_DATABASE_URL'),
  });

  async isAvailable(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
