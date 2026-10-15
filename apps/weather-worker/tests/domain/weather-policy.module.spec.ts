import { Test } from '@nestjs/testing';
import { WeatherPolicyModule } from '../../src/domain/weather-policy.module';
import { ForecastSnapshotFactory } from '../../src/domain/forecast-snapshot.factory';
import { forecastFixture } from '../../../city-ranking-test.fixtures';
describe('WeatherPolicyModule', () => {
  it('composes a complete domain policy graph independently of HTTP and database adapters', async () => {
    const module = await Test.createTestingModule({
      imports: [WeatherPolicyModule],
    }).compile();
    const forecast = forecastFixture();
    const result = module.get(ForecastSnapshotFactory).create({
      city: forecast.city,
      weather: {
        value: forecast.days,
        fetchedAt: new Date(forecast.weatherFetchedAt),
        freshUntil: new Date(forecast.freshUntil),
      },
      marine: null,
    });
    expect(result.days).toHaveLength(7);
    expect(result.marineStatus).toBe('INSUFFICIENT_DATA');
    await module.close();
  });
});
