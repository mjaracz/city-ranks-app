import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { CityQueryError } from '../../../libs/contracts/src/city-query';
import { WEATHER_CITY_FORECAST_QUERY } from '../../../libs/contracts/src/message-patterns';
import { forecastFixture } from '../../city-ranking-test.fixtures';
import { CityForecastQueryHandler } from './city-forecast-query.handler';
import { CityForecastService } from './city-forecast.service';

describe('CityForecastQueryHandler', () => {
  let moduleRef: TestingModule;
  let handler: CityForecastQueryHandler;
  const forecasts = {
    getForecast: jest.fn<CityForecastService['getForecast']>(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    moduleRef = await Test.createTestingModule({
      controllers: [CityForecastQueryHandler],
      providers: [{ provide: CityForecastService, useValue: forecasts }],
    }).compile();
    handler = moduleRef.get(CityForecastQueryHandler);
  });

  afterEach(async () => moduleRef.close());

  it('returns the forecast in the worker response envelope', async () => {
    const forecast = forecastFixture();
    forecasts.getForecast.mockResolvedValue(forecast);

    await expect(handler.getForecast({ city: 'Test Bay' })).resolves.toEqual({
      status: 'OK',
      result: forecast,
    });
    expect(forecasts.getForecast).toHaveBeenCalledWith('Test Bay');
  });

  it('normalizes domain and unexpected failures as typed query errors', async () => {
    forecasts.getForecast.mockRejectedValue(
      new CityQueryError('CITY_NOT_FOUND', 'Unknown city'),
    );
    await expect(
      handler.getForecast({ city: 'Missing' }),
    ).resolves.toMatchObject({
      status: 'ERROR',
      code: 'CITY_NOT_FOUND',
    });

    forecasts.getForecast.mockRejectedValue(new Error('provider detail'));
    await expect(handler.getForecast({ city: 'Test Bay' })).resolves.toEqual({
      status: 'ERROR',
      code: 'RANKING_UNAVAILABLE',
      message: 'City ranking is temporarily unavailable',
    });
  });

  it('exposes the forecast query pattern through Nest message metadata', () => {
    const patterns = Reflect.getMetadata(
      'microservices:pattern',
      CityForecastQueryHandler.prototype.getForecast,
    );
    expect(patterns).toEqual(
      expect.arrayContaining([WEATHER_CITY_FORECAST_QUERY]),
    );
  });
});
