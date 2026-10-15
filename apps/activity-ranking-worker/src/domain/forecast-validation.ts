import { CityQueryError } from '../../../../libs/contracts/src/city-query';
import {
  addCalendarDays,
  CityForecast,
  isCalendarDate,
  localDate,
  WMO_WEATHER_CODES,
} from '../../../../libs/models/src';

export function validateCityForecast(
  value: unknown,
): asserts value is CityForecast {
  const fail = () => {
    throw new CityQueryError(
      'UPSTREAM_UNAVAILABLE',
      'Weather worker returned an invalid forecast',
    );
  };
  if (!value || typeof value !== 'object') fail();
  const forecast = value as CityForecast;
  const hasInvalidForecastMetadata =
    !forecast.city ||
    typeof forecast.city.timezone !== 'string' ||
    !forecast.city.timezone ||
    typeof forecast.city.countryCode !== 'string' ||
    !/^[A-Z]{2}$/.test(forecast.city.countryCode) ||
    typeof forecast.city.name !== 'string' ||
    typeof forecast.city.id !== 'string' ||
    !Number.isFinite(forecast.city.latitude) ||
    Math.abs(forecast.city.latitude) > 90 ||
    !Number.isFinite(forecast.city.longitude) ||
    Math.abs(forecast.city.longitude) > 180 ||
    typeof forecast.snapshotId !== 'string' ||
    !forecast.snapshotId ||
    !['AVAILABLE', 'INSUFFICIENT_DATA', 'NOT_APPLICABLE'].includes(
      forecast.marineStatus,
    );
  if (hasInvalidForecastMetadata) fail();
  let start: string;
  try {
    start = localDate(new Date(), forecast.city.timezone);
  } catch {
    fail();
  }
  for (const instant of [forecast.weatherFetchedAt, forecast.freshUntil]) {
    if (typeof instant !== 'string' || !Number.isFinite(Date.parse(instant)))
      fail();
  }
  const hasInvalidMarineTimestamp =
    forecast.marineFetchedAt !== null &&
    (typeof forecast.marineFetchedAt !== 'string' ||
      !Number.isFinite(Date.parse(forecast.marineFetchedAt)));
  if (hasInvalidMarineTimestamp) fail();
  const hasExpiredForecastOrFutureWeatherSnapshot =
    Date.parse(forecast.freshUntil) <= Date.now() ||
    Date.parse(forecast.weatherFetchedAt) > Date.now() + 1000;
  if (hasExpiredForecastOrFutureWeatherSnapshot) fail();
  if (!Array.isArray(forecast.days) || forecast.days.length !== 7) fail();
  const ranges = {
    temperatureMinCelsius: [-100, 70],
    temperatureMaxCelsius: [-100, 70],
    precipitationMillimeters: [0, 3000],
    snowfallCentimeters: [0, 1000],
    windSpeedMaxKilometersPerHour: [0, 500],
    weatherCode: [0, 99],
    snowDepthMaxMeters: [0, 100],
    waveHeightMaxMeters: [0, 100],
    wavePeriodMaxSeconds: [0, 100],
  };
  forecast.days.forEach((day, index) => {
    const hasInvalidForecastDay =
      !day ||
      !isCalendarDate(day.date) ||
      day.date !== addCalendarDays(start, index);
    if (hasInvalidForecastDay) fail();
    for (const [key, [min, max]] of Object.entries(ranges)) {
      const measurement = day[key];
      const hasInvalidMeasurement =
        measurement !== null &&
        (typeof measurement !== 'number' ||
          !Number.isFinite(measurement) ||
          measurement < min ||
          measurement > max);
      if (hasInvalidMeasurement) fail();
    }
    if (day.weatherCode !== null && !WMO_WEATHER_CODES.has(day.weatherCode))
      fail();
    const hasInvalidTemperatureRange =
      day.temperatureMinCelsius !== null &&
      day.temperatureMaxCelsius !== null &&
      day.temperatureMinCelsius > day.temperatureMaxCelsius;
    if (hasInvalidTemperatureRange) fail();
  });
}
