import type { CityLocation } from './city-ranking';

export interface DailyWeatherForecast {
  date: string;
  temperatureMinCelsius: number | null;
  temperatureMaxCelsius: number | null;
  precipitationMillimeters: number | null;
  snowfallCentimeters: number | null;
  windSpeedMaxKilometersPerHour: number | null;
  weatherCode: number | null;
  snowDepthMaxMeters: number | null;
  waveHeightMaxMeters: number | null;
  wavePeriodMaxSeconds: number | null;
}

export interface CityForecast {
  snapshotId: string;
  city: CityLocation;
  weatherFetchedAt: string;
  marineFetchedAt: string | null;
  freshUntil: string;
  marineStatus: 'AVAILABLE' | 'INSUFFICIENT_DATA' | 'NOT_APPLICABLE';
  days: DailyWeatherForecast[];
}

export const WMO_WEATHER_CODES: ReadonlySet<number> = new Set([
  0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77,
  80, 81, 82, 85, 86, 95, 96, 99,
]);
