import { validateWeatherCoordinates } from '../../src/utils/weather-coordinates.validation';
describe('validateWeatherCoordinates', () => {
  it('preserves coordinate-specific input errors', () => {
    expect(() => validateWeatherCoordinates(null)).toThrow(
      'coordinates must be an object',
    );
    expect(() =>
      validateWeatherCoordinates({ latitude: '0', longitude: 0 }),
    ).toThrow('latitude must be a number between -90 and 90');
    expect(() =>
      validateWeatherCoordinates({ latitude: 0, longitude: 181 }),
    ).toThrow('longitude must be a number between -180 and 180');
    expect(() =>
      validateWeatherCoordinates({ latitude: 0, longitude: 0 }),
    ).not.toThrow();
  });
});
