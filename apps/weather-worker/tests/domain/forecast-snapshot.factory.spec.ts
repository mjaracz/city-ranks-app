import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { forecastFixture, testCity } from '../../../city-ranking-test.fixtures';
import { ForecastSnapshotFactory } from '../../src/domain/forecast-snapshot.factory';
import { MarineCoveragePolicy } from '../../src/domain/marine-coverage.policy';
import { WeatherPolicyModule } from '../../src/domain/weather-policy.module';
describe('ForecastSnapshotFactory', () => {
  let module: TestingModule;
  let factory: ForecastSnapshotFactory;
  const coverage = { classify: jest.fn<MarineCoveragePolicy['classify']>() };
  const sources = () => {
    const forecast = forecastFixture();
    const weather = {
      value: forecast.days,
      fetchedAt: new Date(forecast.weatherFetchedAt),
      freshUntil: new Date(forecast.freshUntil),
    };
    const marine = {
      value: {
        latitude: testCity.latitude,
        longitude: testCity.longitude,
        days: forecast.days.map(() => ({ height: 1.5, period: 10 })),
      },
      fetchedAt: weather.fetchedAt,
      freshUntil: new Date(weather.fetchedAt.getTime() + 60_000),
    };
    return { city: testCity, weather, marine };
  };
  beforeAll(async () => {
    module = await Test.createTestingModule({ imports: [WeatherPolicyModule] })
      .overrideProvider(MarineCoveragePolicy)
      .useValue(coverage)
      .compile();
    factory = module.get(ForecastSnapshotFactory);
  });
  beforeEach(() => coverage.classify.mockReturnValue('AVAILABLE'));
  afterAll(async () => module.close());
  it('preserves provenance, uses the earliest expiry and produces stable content identity', () => {
    const context = sources();
    const before = structuredClone(context);
    const snapshot = factory.create(context);
    expect(snapshot.freshUntil).toBe(context.marine.freshUntil.toISOString());
    expect(snapshot.weatherFetchedAt).toBe(
      context.weather.fetchedAt.toISOString(),
    );
    expect(snapshot.days[0].waveHeightMaxMeters).toBe(1.5);
    expect(factory.create(context)).toEqual(snapshot);
    expect(context).toEqual(before);
    coverage.classify.mockReturnValue('NOT_APPLICABLE');
    const outside = factory.create(context);
    expect(outside.marineStatus).toBe('NOT_APPLICABLE');
    expect(outside.snapshotId).not.toBe(snapshot.snapshotId);
  });
  it('retains weather and explicit missing marine observations when the optional source fails', () => {
    coverage.classify.mockReturnValue('INSUFFICIENT_DATA');
    const snapshot = factory.create({ ...sources(), marine: null });
    expect(snapshot.marineFetchedAt).toBeNull();
    expect(
      snapshot.days.every(
        (day) =>
          day.waveHeightMaxMeters === null && day.wavePeriodMaxSeconds === null,
      ),
    ).toBe(true);
  });
  it('rejects an expired snapshot', () => {
    const context = sources();
    context.weather.freshUntil = new Date(0);
    expect(() => factory.create(context)).toThrow(
      expect.objectContaining({ code: 'UPSTREAM_UNAVAILABLE' }),
    );
  });
});
