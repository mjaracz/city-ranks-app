import 'reflect-metadata';
import { Expose, Transform } from 'class-transformer';
import {
  IsDefined,
  IsNumber,
  IsString,
  isString,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class CommandCityDto {
  @Expose()
  @Transform(({ value }) => (isString(value) ? value.trim() : value))
  @IsString()
  @Length(1, 120)
  city: string;
}

export class CommandCoordinatesDto {
  @Expose()
  @ValidateIf(
    (input: CommandCoordinatesDto) =>
      input.latitude !== undefined || input.longitude !== undefined,
  )
  @IsDefined()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @Expose()
  @ValidateIf(
    (input: CommandCoordinatesDto) =>
      input.latitude !== undefined || input.longitude !== undefined,
  )
  @IsDefined()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;
}
