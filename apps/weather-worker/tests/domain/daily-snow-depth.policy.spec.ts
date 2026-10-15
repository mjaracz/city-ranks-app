import { Test, TestingModule } from '@nestjs/testing';
import { DailySnowDepthPolicy } from '../../src/domain/daily-snow-depth.policy';
import { WeatherPolicyModule } from '../../src/domain/weather-policy.module';
describe('DailySnowDepthPolicy', () => {
  let module: TestingModule;
  let policy: DailySnowDepthPolicy;
  const date = '2026-10-15';
  const times = Array.from(
    { length: 24 },
    (_, i) => date + 'T' + String(i).padStart(2, '0') + ':00',
  );
  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [WeatherPolicyModule],
    }).compile();
    policy = module.get(DailySnowDepthPolicy);
  });
  afterAll(async () => module.close());
  it('preserves a valid zero and returns the daily maximum for complete coverage', () => {
    expect(
      policy.maximum({ date, times, observations: times.map(() => 0) }),
    ).toBe(0);
    expect(
      policy.maximum({
        date,
        times,
        observations: times.map((_, i) => i / 100),
      }),
    ).toBe(0.23);
  });
  it.each([null, undefined, NaN, Infinity, '0'])(
    'treats incomplete or invalid observations as missing: %s',
    (missing) => {
      expect(
        policy.maximum({
          date,
          times,
          observations: [missing as number, ...times.slice(1).map(() => 0)],
        }),
      ).toBeNull();
    },
  );
  it('requires exactly 24 observations belonging to the requested date', () => {
    expect(
      policy.maximum({
        date,
        times: times.slice(1),
        observations: times.map(() => 1),
      }),
    ).toBeNull();
    expect(
      policy.maximum({
        date: '2026-10-16',
        times,
        observations: times.map(() => 1),
      }),
    ).toBeNull();
    expect(
      policy.maximum({
        date,
        times: [...times, date + 'T24:00'],
        observations: Array(25).fill(1),
      }),
    ).toBeNull();
  });
});
