import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { CommandCityDto } from '../dto/domain-command.dto';

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
