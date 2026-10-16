import 'reflect-metadata';

import { Expose, Transform } from 'class-transformer';
import { IsString, isString, Length } from 'class-validator';

export class CommandCityDto {
  @Expose()
  @Transform(({ value }) => (isString(value) ? value.trim() : value))
  @IsString()
  @Length(1, 120)
  city: string;
}
