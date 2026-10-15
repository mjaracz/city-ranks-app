import { Injectable } from '@nestjs/common';
import { DailySnowCoverageDto } from '../dto/daily-snow-coverage.dto';
import { WeatherInputValidator } from '../utils/weather-input.validator';

export interface SnowDepthContext {
  readonly date: string;
  readonly times: readonly string[];
  readonly observations: readonly (number | null)[];
}

@Injectable()
export class DailySnowDepthPolicy {
  constructor(private readonly validation: WeatherInputValidator) {}

  maximum({ date, times, observations }: SnowDepthContext): number | null {
    const selected = times.flatMap((time, index) =>
      time.startsWith(date + 'T') ? [observations[index]] : [],
    );
    // BQ-12: Confirm whether DST days require 23/25 local hours instead of 24 model hours.
    // BQ-05: A daily snow-depth maximum requires all 24 model hours to be present.
    const coverage = this.validation.tryTransform(DailySnowCoverageDto, {
      observations: selected,
    });
    return coverage ? Math.max(...coverage.observations) : null;
  }
}
