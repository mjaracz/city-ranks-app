import { CityForecastQueryHandler } from './controllers/city-forecast-query.handler';
import { CityForecastService } from './services/city-forecast.service';
import { OpenMeteoJsonClient } from './data-providers/open-meteo-json.client';
import { Module } from '@nestjs/common';
import { OpenMeteoResponseParser } from './services/open-meteo-response-parser.service';
import { JetStreamEventStore } from '../../../libs/messaging/src/jetstream-event-store';
import { OpenMeteoProvider } from './data-providers/open-meteo.provider';
import { WeatherCommandHandler } from './controllers/weather-command.handler';
import { WeatherDatabaseHealth } from './services/weather-database-health.service';
import { WeatherHealthHandler } from './controllers/weather-health.handler';
import { WeatherPersistenceModule } from './infrastructure/weather-persistence.module';
import { WeatherQueryHandler } from './controllers/weather-query.handler';

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
    OpenMeteoResponseParser,
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
