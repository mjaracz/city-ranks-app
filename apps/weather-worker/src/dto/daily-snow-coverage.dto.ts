import 'reflect-metadata';
import { Expose } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsNumber } from 'class-validator';

export class DailySnowCoverageDto {
  @Expose()
  @IsArray()
  @ArrayMinSize(24)
  @ArrayMaxSize(24)
  @IsNumber({}, { each: true })
  observations: number[];
}
