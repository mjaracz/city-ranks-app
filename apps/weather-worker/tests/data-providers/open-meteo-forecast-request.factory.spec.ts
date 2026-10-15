import { Test } from '@nestjs/testing';
import { OpenMeteoForecastRequestFactory } from '../../src/data-providers/open-meteo-forecast-request.factory';
import { forecastFixture, testCity } from '../../../city-ranking-test.fixtures';
describe('OpenMeteoForecastRequestFactory', () => {
  it('requests the resolved city window with explicit units and the required weather and marine fields', async () => {
    const module = await Test.createTestingModule({
      providers: [OpenMeteoForecastRequestFactory],
    }).compile();
    const factory = module.get(OpenMeteoForecastRequestFactory);
    const dates = forecastFixture().days.map((day) => day.date);
    expect(factory.geocoding('Test Bay')).toEqual({
      name: 'test bay',
      count: '1',
      language: 'en',
      format: 'json',
    });
    expect(factory.weather(testCity, dates)).toMatchObject({
      latitude: String(testCity.latitude),
      longitude: String(testCity.longitude),
      timezone: testCity.timezone,
      start_date: dates[0],
      end_date: dates[6],
      hourly: 'snow_depth',
      temperature_unit: 'celsius',
      wind_speed_unit: 'kmh',
      precipitation_unit: 'mm',
    });
    expect(factory.marine(testCity, dates)).toMatchObject({
      start_date: dates[0],
      end_date: dates[6],
      daily: 'wave_height_max,wave_period_max',
      cell_selection: 'sea',
      length_unit: 'metric',
    });
    await module.close();
  });
});
