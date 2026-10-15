import { Module } from '@nestjs/common';

import { WeatherInputValidator } from '../utils/weather-input.validator';

import { CitySelectionPolicy } from './city-selection.policy';
import { DailySnowDepthPolicy } from './daily-snow-depth.policy';
import { ForecastSnapshotFactory } from './forecast-snapshot.factory';
import { ForecastWindowPolicy } from './forecast-window.policy';
import { MarineCoveragePolicy } from './marine-coverage.policy';

const policies = [
  WeatherInputValidator,
  CitySelectionPolicy,
  DailySnowDepthPolicy,
  ForecastSnapshotFactory,
  ForecastWindowPolicy,
  MarineCoveragePolicy,
];

@Module({ providers: policies, exports: policies })
export class WeatherPolicyModule {}
