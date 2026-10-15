import {
  addCalendarDays,
  CityForecast,
  CityLocation,
  DailyWeatherForecast,
  localDate,
} from '@libs/models';

export const testCity: CityLocation = {
  id: 'open-meteo:999999',
  name: 'Test Bay',
  countryCode: 'PL',
  country: 'Poland',
  region: 'Test Region',
  latitude: 54.5,
  longitude: 18.5,
  timezone: 'Europe/Warsaw',
};

export function forecastFixture(now = new Date()): CityForecast {
  const start = localDate(now, testCity.timezone);
  const day: Omit<DailyWeatherForecast, 'date'> = {
    temperatureMinCelsius: 15,
    temperatureMaxCelsius: 25,
    precipitationMillimeters: 0,
    snowfallCentimeters: 0,
    windSpeedMaxKilometersPerHour: 10,
    weatherCode: 0,
    snowDepthMaxMeters: 0,
    waveHeightMaxMeters: 1.5,
    wavePeriodMaxSeconds: 10,
  };
  return {
    snapshotId: 'test-snapshot',
    city: { ...testCity },
    marineStatus: 'AVAILABLE',
    weatherFetchedAt: now.toISOString(),
    marineFetchedAt: now.toISOString(),
    freshUntil: new Date(now.getTime() + 3_600_000).toISOString(),
    days: Array.from({ length: 7 }, (_, index) => ({
      ...day,
      date: addCalendarDays(start, index),
    })),
  };
}

export function upstreamFixture(
  kind: 'geocoding' | 'forecast' | 'marine',
  now = new Date(),
): Record<string, unknown> {
  const snapshot = forecastFixture(now);
  const time = snapshot.days.map((day) => day.date);
  if (kind === 'geocoding')
    return {
      results: [
        {
          id: 999999,
          name: testCity.name,
          country_code: 'PL',
          country: 'Poland',
          admin1: testCity.region,
          latitude: testCity.latitude,
          longitude: testCity.longitude,
          timezone: testCity.timezone,
        },
      ],
    };
  if (kind === 'marine')
    return {
      latitude: testCity.latitude,
      longitude: testCity.longitude,
      timezone: testCity.timezone,
      daily: {
        time,
        wave_height_max: time.map(() => 1.5),
        wave_period_max: time.map(() => 10),
      },
    };
  return {
    timezone: testCity.timezone,
    daily: {
      time,
      temperature_2m_min: time.map(() => 15),
      temperature_2m_max: time.map(() => 25),
      precipitation_sum: time.map(() => 0),
      snowfall_sum: time.map(() => 0),
      wind_speed_10m_max: time.map(() => 10),
      weather_code: time.map(() => 0),
    },
    hourly: {
      time: time.flatMap((date) =>
        Array.from(
          { length: 24 },
          (_, hour) => `${date}T${String(hour).padStart(2, '0')}:00`,
        ),
      ),
      snow_depth: Array.from({ length: 168 }, () => 0),
    },
  };
}
