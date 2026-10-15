import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CityForecast, CityLocation, DailyWeatherForecast } from '@libs/models';
import { ForecastSnapshotDto } from '../dto/forecast-snapshot.dto';
import { WeatherInputValidator } from '../utils/weather-input.validator';
import { ForecastSource, MarineForecast } from './forecast-source';
import { MarineCoveragePolicy } from './marine-coverage.policy';

export interface ForecastSnapshotContext {
  readonly city: CityLocation;
  readonly weather: ForecastSource<DailyWeatherForecast[]>;
  readonly marine: ForecastSource<MarineForecast> | null;
}

@Injectable()
export class ForecastSnapshotFactory {
  constructor(
    private readonly coverage: MarineCoveragePolicy,
    private readonly validation: WeatherInputValidator,
  ) {}

  create({ city, weather, marine }: ForecastSnapshotContext): CityForecast {
    const marineStatus = this.coverage.classify(city, marine?.value ?? null);
    const days = weather.value.map((day, index) => ({
      ...day,
      waveHeightMaxMeters: marine?.value.days[index].height ?? null,
      wavePeriodMaxSeconds: marine?.value.days[index].period ?? null,
    }));
    const weatherFetchedAt = weather.fetchedAt.toISOString();
    const marineFetchedAt = marine?.fetchedAt.toISOString() ?? null;
    const freshUntil = new Date(
      Math.min(
        weather.freshUntil.getTime(),
        marine?.freshUntil.getTime() ?? Infinity,
      ),
    ).toISOString();
    const snapshotId = createHash('sha256')
      .update(
        JSON.stringify({
          city,
          weatherFetchedAt,
          marineFetchedAt,
          marineStatus,
          days,
        }),
      )
      .digest('hex');
    const result: CityForecast = {
      snapshotId,
      city,
      weatherFetchedAt,
      marineFetchedAt,
      freshUntil,
      marineStatus,
      days,
    };
    this.validation.transform(ForecastSnapshotDto, result);
    return result;
  }
}
