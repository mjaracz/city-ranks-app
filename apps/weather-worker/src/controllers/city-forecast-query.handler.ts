import type { CityQuery, CityQueryResult } from '@libs/contracts/city-query';
import type { CityForecast } from '@libs/models';

import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';

import { cityQueryFailure } from '@libs/contracts/city-query';
import { WEATHER_CITY_FORECAST_QUERY } from '@libs/contracts/message-patterns';

import { CityForecastService } from '../services/city-forecast.service';

@Controller()
export class CityForecastQueryHandler {
  constructor(private readonly forecasts: CityForecastService) {}

  @MessagePattern(WEATHER_CITY_FORECAST_QUERY)
  async getForecast(query: CityQuery): Promise<CityQueryResult<CityForecast>> {
    try {
      return {
        status: 'OK',
        result: await this.forecasts.getForecast(query?.city),
      };
    } catch (error) {
      return cityQueryFailure(error);
    }
  }
}
