import {
  isArray,
  isNumber,
  max,
  min,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

import {
  addCalendarDays,
  CityLocation,
  DailyWeatherForecast,
  localDate,
} from '@libs/models';

@ValidatorConstraint({ name: 'nullableNumberRange', async: false })
export class NullableNumberRange implements ValidatorConstraintInterface {
  validate(value: unknown, { constraints }: ValidationArguments): boolean {
    return (
      value === null ||
      (isNumber(value) &&
        min(value, constraints[0]) &&
        max(value, constraints[1]))
    );
  }
}

@ValidatorConstraint({ name: 'matchingTimeSeriesLength', async: false })
export class MatchingTimeSeriesLength implements ValidatorConstraintInterface {
  validate(value: unknown, { object }: ValidationArguments): boolean {
    const times = (object as { time: unknown }).time;
    return isArray(value) && isArray(times) && value.length === times.length;
  }
}

@ValidatorConstraint({ name: 'orderedTemperatureRange', async: false })
export class OrderedTemperatureRange implements ValidatorConstraintInterface {
  validate(value: unknown, { object }: ValidationArguments): boolean {
    const minimums = (object as { temperature_2m_min: unknown })
      .temperature_2m_min;
    return (
      isArray(value) &&
      isArray(minimums) &&
      value.every(
        (maximum, index) =>
          maximum === null ||
          minimums[index] === null ||
          minimums[index] <= maximum,
      )
    );
  }
}

@ValidatorConstraint({ name: 'currentForecastWindow', async: false })
export class CurrentForecastWindow implements ValidatorConstraintInterface {
  validate(value: unknown, { object }: ValidationArguments): boolean {
    const city = (object as { city: CityLocation }).city;
    try {
      const start = localDate(new Date(), city.timezone);
      return (
        isArray(value) &&
        value.every(
          (day: DailyWeatherForecast, index) =>
            day?.date === addCalendarDays(start, index),
        )
      );
    } catch {
      return false;
    }
  }
}

@ValidatorConstraint({ name: 'nonFutureTimestamp', async: false })
export class NonFutureTimestamp implements ValidatorConstraintInterface {
  validate(value: string): boolean {
    return Date.parse(value) <= Date.now() + 1000;
  }
}

@ValidatorConstraint({ name: 'unexpiredTimestamp', async: false })
export class UnexpiredTimestamp implements ValidatorConstraintInterface {
  validate(value: string): boolean {
    return Date.parse(value) > Date.now();
  }
}
