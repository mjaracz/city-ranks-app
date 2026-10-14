import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import type {
  CityQuery,
  CityQueryResult,
} from '../../../libs/contracts/src/city-query';
import { cityQueryFailure } from '../../../libs/contracts/src/city-query';
import { WEATHER_CITY_FORECAST_QUERY } from '../../../libs/contracts/src/message-patterns';
import type { CityForecast } from '../../../libs/models/src';
import { CityForecastService } from './city-forecast.service';

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
