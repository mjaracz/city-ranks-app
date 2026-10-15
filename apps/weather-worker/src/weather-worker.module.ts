import { Module } from '@nestjs/common';

import { WEATHER_FORECAST_REFRESH_COMMAND } from '@libs/contracts/message-patterns';
import { JetStreamCommandConsumer } from '@libs/messaging/jetstream-command-consumer';
import { JetStreamEventStore } from '@libs/messaging/jetstream-event-store';

import { CityForecastQueryHandler } from './controllers/city-forecast-query.handler';
import { WeatherCommandHandler } from './controllers/weather-command.handler';
import { WeatherHealthHandler } from './controllers/weather-health.handler';
import { WeatherQueryHandler } from './controllers/weather-query.handler';
import { OpenMeteoForecastRequestFactory } from './data-providers/open-meteo-forecast-request.factory';
import { OpenMeteoJsonClient } from './data-providers/open-meteo-json.client';
import { OpenMeteoConfiguration } from './data-providers/open-meteo.configuration';
import { OpenMeteoProvider } from './data-providers/open-meteo.provider';
import { WeatherPolicyModule } from './domain/weather-policy.module';
import { WEATHER_COMMAND_CONSUMER } from './infrastructure/weather-command-consumer';
import { WeatherPersistenceModule } from './infrastructure/weather-persistence.module';
import { CityForecastService } from './services/city-forecast.service';
import { OpenMeteoResponseParser } from './services/open-meteo-response-parser.service';
import { WeatherDatabaseHealth } from './services/weather-database-health.service';

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
