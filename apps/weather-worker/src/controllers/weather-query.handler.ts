import type {
  CurrentWeather,
  WeatherCoordinates,
} from '../data-providers/open-meteo.types';

import { Controller } from '@nestjs/common';
import { MessagePattern, RpcException } from '@nestjs/microservices';

import { WEATHER_CURRENT_QUERY } from '@libs/contracts/message-patterns';

import { OpenMeteoProvider } from '../data-providers/open-meteo.provider';

@Controller()
export class WeatherQueryHandler {
  constructor(private readonly provider: OpenMeteoProvider) {}

  @MessagePattern(WEATHER_CURRENT_QUERY)
  async getCurrentWeather(
    coordinates: WeatherCoordinates,
  ): Promise<CurrentWeather> {
    try {
      return await this.provider.getCurrentWeather(coordinates);
    } catch (error) {
      throw new RpcException(
        error instanceof RangeError ? error.message : 'Weather query failed',
      );
    }
  }
}
