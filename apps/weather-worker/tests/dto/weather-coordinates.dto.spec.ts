import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { WeatherCoordinatesInputDto } from '../../src/dto/weather-coordinates.dto';

describe('WeatherCoordinatesDto', () => {
  it.each([
    { latitude: 0, longitude: 0 },
    { latitude: 90, longitude: -180 },
  ])('accepts valid numeric coordinates: %p', (coordinates) => {
    expect(
      validateSync(
        plainToInstance(WeatherCoordinatesInputDto, { coordinates }),
      ),
    ).toEqual([]);
  });
  it.each([
    null,
    {},
    { latitude: '0', longitude: 0 },
    { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: Infinity },
  ])('rejects invalid coordinates: %p', (coordinates) => {
    expect(
      validateSync(
        plainToInstance(
          WeatherCoordinatesInputDto,
          { coordinates },
          { enableImplicitConversion: false },
        ),
      ).length,
    ).toBeGreaterThan(0);
  });
});
