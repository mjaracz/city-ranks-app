import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CommandCityDto,
  CommandCoordinatesDto,
} from '../dto/domain-command.dto';

export function commandCity(city: unknown): string {
  const dto = plainToInstance(
    CommandCityDto,
    { city },
    { enableImplicitConversion: false },
  );
  if (validateSync(dto).length)
    throw new BadRequestException('City must contain 1 to 120 characters');
  return dto.city;
}

export function commandCoordinates(
  latitude: unknown,
  longitude: unknown,
): { latitude: number; longitude: number } | undefined {
  const dto = plainToInstance(
    CommandCoordinatesDto,
    { latitude, longitude },
    { enableImplicitConversion: false },
  );
  const errors = validateSync(dto);
  if (
    errors.some(
      (error) =>
        error.constraints?.isDefined && dto[error.property] === undefined,
    )
  )
    throw new BadRequestException(
      'Latitude and longitude must be provided together',
    );
  if (errors.length)
    throw new BadRequestException('Coordinates are outside valid ranges');
  return dto.latitude === undefined
    ? undefined
    : { latitude: dto.latitude, longitude: dto.longitude! };
}
