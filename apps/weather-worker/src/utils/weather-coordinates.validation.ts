import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { WeatherCoordinatesInputDto } from '../dto/weather-coordinates.dto';

export function validateWeatherCoordinates(coordinates: unknown): void {
  const dto = plainToInstance(
    WeatherCoordinatesInputDto,
    { coordinates },
    { enableImplicitConversion: false },
  );
  const errors = validateSync(dto, { forbidUnknownValues: true });
  if (errors.length === 0) return;
  const error = errors[0];
  if (error.constraints?.isObject)
    throw new RangeError('coordinates must be an object');
  if (error.children?.some((child) => child.property === 'latitude'))
    throw new RangeError('latitude must be a number between -90 and 90');
  throw new RangeError('longitude must be a number between -180 and 180');
}
