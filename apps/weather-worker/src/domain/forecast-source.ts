export interface ForecastSource<T> {
  value: T;
  fetchedAt: Date;
  freshUntil: Date;
}

export interface MarineForecast {
  latitude: number;
  longitude: number;
  days: { height: number | null; period: number | null }[];
}
