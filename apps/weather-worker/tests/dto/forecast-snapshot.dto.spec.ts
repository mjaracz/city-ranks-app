import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';

import { CityQueryError } from '@libs/contracts/city-query';

import { forecastFixture } from '../../../city-ranking-test.fixtures';
import { WeatherPolicyModule } from '../../src/domain/weather-policy.module';
import { ForecastSnapshotDto } from '../../src/dto/forecast-snapshot.dto';
import { WeatherInputValidator } from '../../src/utils/weather-input.validator';

describe('Accepted forecast snapshot', () => {
  let moduleRef: TestingModule;
  let parser: WeatherInputValidator;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [WeatherPolicyModule],
      providers: [WeatherInputValidator],
    }).compile();
    parser = moduleRef.get(WeatherInputValidator);
  });
  afterEach(() => jest.useRealTimers());
  afterAll(async () => moduleRef.close());

  it.each([
    '2026-03-28T22:30:00Z',
    '2026-10-24T22:30:00Z',
    '2026-12-29T12:00:00Z',
  ])('accepts seven city-local dates across calendar boundary %s', (now) => {
    jest.useFakeTimers().setSystemTime(new Date(now));
    expect(() =>
      parser.transform(ForecastSnapshotDto, forecastFixture()),
    ).not.toThrow();
  });

  it.each(['2000-01-01T00:00:00Z', 'invalid', null, undefined])(
    'rejects an expired or malformed freshness deadline %p',
    (freshUntil) => {
      expect(() =>
        parser.transform(ForecastSnapshotDto, {
          ...forecastFixture(),
          freshUntil,
        }),
      ).toThrow(CityQueryError);
    },
  );

  it('rejects a snapshot that expires while acquisition is in progress', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-15T10:00:00Z'));
    const forecast = forecastFixture();
    jest.setSystemTime(new Date(forecast.freshUntil));
    expect(() => parser.transform(ForecastSnapshotDto, forecast)).toThrow(
      CityQueryError,
    );
  });

  it('rejects future weather timestamps while allowing absent marine observations', () => {
    const forecast = forecastFixture();
    expect(() =>
      parser.transform(ForecastSnapshotDto, {
        ...forecast,
        marineFetchedAt: null,
      }),
    ).not.toThrow();
    forecast.weatherFetchedAt = new Date(Date.now() + 60_000).toISOString();
    expect(() => parser.transform(ForecastSnapshotDto, forecast)).toThrow(
      CityQueryError,
    );
  });

  it.each(['invalid', undefined])(
    'rejects an invalid marine acquisition timestamp %p',
    (marineFetchedAt) => {
      expect(() =>
        parser.transform(ForecastSnapshotDto, {
          ...forecastFixture(),
          marineFetchedAt,
        }),
      ).toThrow(CityQueryError);
    },
  );

  it('rejects incomplete, reordered and stale city-local windows', () => {
    const forecast = forecastFixture();
    forecast.days.pop();
    expect(() => parser.transform(ForecastSnapshotDto, forecast)).toThrow(
      CityQueryError,
    );
    const reordered = forecastFixture();
    reordered.days.reverse();
    expect(() => parser.transform(ForecastSnapshotDto, reordered)).toThrow(
      CityQueryError,
    );
    const stale = forecastFixture(new Date('2000-01-01T00:00:00Z'));
    stale.freshUntil = new Date(Date.now() + 60_000).toISOString();
    expect(() => parser.transform(ForecastSnapshotDto, stale)).toThrow(
      CityQueryError,
    );
  });
});
