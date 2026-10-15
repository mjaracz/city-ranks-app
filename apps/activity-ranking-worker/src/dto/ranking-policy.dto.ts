import 'reflect-metadata';

import { Expose, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsEnum,
  IsNumber,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { Activity, DailyWeatherForecast, EvaluationState } from '@libs/models';

class PolicyActivityEvaluationDto {
  @Expose()
  @IsEnum(Activity)
  activity: Activity;

  @Expose()
  @IsEnum(EvaluationState)
  state: EvaluationState;
}

export class RankedPolicyEvaluationDto extends PolicyActivityEvaluationDto {
  @Expose()
  @IsNumber()
  @Min(0)
  @Max(100)
  score: number;
}

export class UnavailablePolicyEvaluationDto extends PolicyActivityEvaluationDto {
  @Expose()
  @Equals(null)
  score: null;

  @Expose()
  @Equals(null)
  rank: null;
}

export class DailyRankingInputDto {
  @Expose()
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @ArrayUnique((item: PolicyActivityEvaluationDto) => item?.activity)
  @ValidateNested({ each: true })
  @Type(() => PolicyActivityEvaluationDto, {
    discriminator: {
      property: 'state',
      subTypes: [
        { name: EvaluationState.RANKED, value: RankedPolicyEvaluationDto },
        {
          name: EvaluationState.INSUFFICIENT_DATA,
          value: UnavailablePolicyEvaluationDto,
        },
        {
          name: EvaluationState.NOT_APPLICABLE,
          value: UnavailablePolicyEvaluationDto,
        },
      ],
    },
    keepDiscriminatorProperty: true,
  })
  evaluations: PolicyActivityEvaluationDto[];
}

export class ForecastRankingInputDto {
  @Expose()
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  days: DailyWeatherForecast[];
}
