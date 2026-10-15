import {
  isBoolean,
  isDateString,
  isNumber,
  isObject,
  isString,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'rankingPeriodLength', async: false })
export class RankingPeriodLength implements ValidatorConstraintInterface {
  validate(until: string, { object }: ValidationArguments): boolean {
    const { from } = object as { from: string };
    return (
      isDateString(from, { strict: true }) &&
      isDateString(until, { strict: true }) &&
      this.isAllowedDuration(from, until)
    );
  }

  defaultMessage(): string {
    return 'Ranking period must contain 1 to 31 days, with an exclusive end date';
  }

  private isAllowedDuration(from: string, until: string): boolean {
    const days = (Date.parse(until) - Date.parse(from)) / 86_400_000;
    return days >= 1 && days <= 31;
  }
}

@ValidatorConstraint({ name: 'scalarActivityFactors', async: false })
export class ScalarActivityFactors implements ValidatorConstraintInterface {
  validate(factors: unknown): boolean {
    return (
      isObject(factors) &&
      Object.values(factors).every(
        (value) =>
          value === null ||
          isString(value) ||
          isNumber(value) ||
          isBoolean(value),
      )
    );
  }

  defaultMessage(): string {
    return 'Ranking factors must contain finite scalar values';
  }
}
