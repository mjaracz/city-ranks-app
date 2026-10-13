import { Module } from '@nestjs/common';
import { JetStreamEventStore } from '../../../libs/messaging/src/jetstream-event-store';
import { OpenMeteoProvider } from './data-providers/open-meteo.provider';
import { WeatherCommandHandler } from './weather-command.handler';
import { WeatherDatabaseHealth } from './weather-database-health.service';
import { WeatherHealthHandler } from './weather-health.handler';

@Module({
  controllers: [WeatherHealthHandler],
  providers: [
    OpenMeteoProvider,
    WeatherCommandHandler,
    WeatherDatabaseHealth,
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
