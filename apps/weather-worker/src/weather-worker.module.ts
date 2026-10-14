import { CityForecastQueryHandler } from './city-forecast-query.handler';
import { CityForecastService } from './city-forecast.service';
import { OpenMeteoJsonClient } from './data-providers/open-meteo-json.client';
import { Module } from '@nestjs/common';
import { JetStreamEventStore } from '../../../libs/messaging/src/jetstream-event-store';
import { OpenMeteoProvider } from './data-providers/open-meteo.provider';
import { WeatherCommandHandler } from './weather-command.handler';
import { WeatherDatabaseHealth } from './weather-database-health.service';
import { WeatherHealthHandler } from './weather-health.handler';
import { WeatherPersistenceModule } from './persistence/weather-persistence.module';
import { WeatherQueryHandler } from './weather-query.handler';

@Module({
  imports: [WeatherPersistenceModule],
  controllers: [
    WeatherHealthHandler,
    WeatherQueryHandler,
    CityForecastQueryHandler,
  ],
  providers: [
    WeatherCommandHandler,
    WeatherDatabaseHealth,
    OpenMeteoProvider,
    OpenMeteoJsonClient,
    CityForecastService,
    {
      provide: JetStreamEventStore,
      useFactory: () =>
        new JetStreamEventStore({
          streamName: 'WEATHER_EVENTS',
          subjectPrefix: 'weather.events',
        }),
    },
  ],
})
export class WeatherWorkerModule {}
