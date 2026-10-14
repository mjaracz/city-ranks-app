import { CityQueryError } from '../../../../libs/contracts/src/city-query';
import { forecastFixture } from '../../../city-ranking-test.fixtures';
import { validateCityForecast } from '../../src/domain/forecast-validation';

describe('validateCityForecast', () => {
  it('accepts a complete seven-day forecast with valid city-local dates', () => {
    expect(() => validateCityForecast(forecastFixture())).not.toThrow();
  });

  it('rejects an unsupported timezone, invalid coordinates, and expired snapshots', () => {
    const forecast = forecastFixture();
    expect(() =>
      validateCityForecast({
        ...forecast,
        city: { ...forecast.city, timezone: 'Unknown/Timezone' },
      }),
    ).toThrow(CityQueryError);
    expect(() =>
      validateCityForecast({
        ...forecast,
        city: { ...forecast.city, latitude: 91 },
      }),
    ).toThrow('Weather worker returned an invalid forecast');
    expect(() =>
      validateCityForecast({ ...forecast, freshUntil: '2000-01-01T00:00:00Z' }),
    ).toThrow('Weather worker returned an invalid forecast');
  });

  it('rejects observations outside physical bounds and invalid date windows', () => {
    const forecast = forecastFixture();
    forecast.days[0].precipitationMillimeters = -1;
    expect(() => validateCityForecast(forecast)).toThrow(
      'Weather worker returned an invalid forecast',
    );

    const wrongWindow = forecastFixture();
    wrongWindow.days[3].date = '2000-01-01';
    expect(() => validateCityForecast(wrongWindow)).toThrow(
      'Weather worker returned an invalid forecast',
    );
  });

  it('rejects unsupported weather codes and reversed temperature ranges', () => {
    const forecast = forecastFixture();
    forecast.days[0].weatherCode = 98;
    expect(() => validateCityForecast(forecast)).toThrow(
      'Weather worker returned an invalid forecast',
    );

    const reversed = forecastFixture();
    reversed.days[0].temperatureMinCelsius = 30;
    reversed.days[0].temperatureMaxCelsius = 20;
    expect(() => validateCityForecast(reversed)).toThrow(
      'Weather worker returned an invalid forecast',
    );
  });
});
