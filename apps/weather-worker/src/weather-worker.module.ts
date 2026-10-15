import { WEATHER_COMMAND_CONSUMER } from './infrastructure/weather-command-consumer';
import { JetStreamCommandConsumer } from '@libs/messaging/jetstream-command-consumer';
import { WEATHER_FORECAST_REFRESH_COMMAND } from '@libs/contracts/message-patterns';
import { WeatherPolicyModule } from './domain/weather-policy.module';
import { OpenMeteoConfiguration } from './data-providers/open-meteo.configuration';
import { OpenMeteoForecastRequestFactory } from './data-providers/open-meteo-forecast-request.factory';
import { CityForecastQueryHandler } from './controllers/city-forecast-query.handler';
import { CityForecastService } from './services/city-forecast.service';
import { OpenMeteoJsonClient } from './data-providers/open-meteo-json.client';
import { Module } from '@nestjs/common';
import { OpenMeteoResponseParser } from './services/open-meteo-response-parser.service';
import { JetStreamEventStore } from '@libs/messaging/jetstream-event-store';
import { OpenMeteoProvider } from './data-providers/open-meteo.provider';
import { WeatherCommandHandler } from './controllers/weather-command.handler';
import { WeatherDatabaseHealth } from './services/weather-database-health.service';
import { WeatherHealthHandler } from './controllers/weather-health.handler';
import { WeatherPersistenceModule } from './infrastructure/weather-persistence.module';
import { WeatherQueryHandler } from './controllers/weather-query.handler';

@Module({
  imports: [WeatherPersistenceModule, WeatherPolicyModule],
  controllers: [
    WeatherHealthHandler,
    WeatherQueryHandler,
    CityForecastQueryHandler,
  ],
  providers: [
    {
      provide: WEATHER_COMMAND_CONSUMER,
      useFactory: () =>
        new JetStreamCommandConsumer({
          durableName: 'weather-worker-v1',
          subject: WEATHER_FORECAST_REFRESH_COMMAND,
        }),
    },
    WeatherCommandHandler,
    WeatherDatabaseHealth,
    OpenMeteoProvider,
    OpenMeteoConfiguration,
    OpenMeteoForecastRequestFactory,
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
