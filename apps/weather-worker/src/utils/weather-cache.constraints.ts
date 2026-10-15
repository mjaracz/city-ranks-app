import {
  isDate,
  isObject,
  isString,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'cacheParameters', async: false })
export class CacheParameters implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      isObject(value) &&
      Object.entries(value).every(
        ([key, item]) => key.toLowerCase() !== 'apikey' && isString(item),
      )
    );
  }
}

@ValidatorConstraint({ name: 'cacheExpiry', async: false })
export class CacheExpiry implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isDate(value) && value.getTime() > Date.now();
  }
}

@ValidatorConstraint({ name: 'cacheWriteTime', async: false })
export class CacheWriteTime implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isDate(value) && value.getTime() <= Date.now() + 1000;
  }
}
