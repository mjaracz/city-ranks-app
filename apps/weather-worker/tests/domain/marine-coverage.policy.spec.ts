import { Test } from '@nestjs/testing';
import { MarineCoveragePolicy } from '../../src/domain/marine-coverage.policy';
describe('MarineCoveragePolicy', () => {
  it('distinguishes absent observations from an observed grid outside the 50 km scope', async () => {
    const module = await Test.createTestingModule({
      providers: [MarineCoveragePolicy],
    }).compile();
    const policy = module.get(MarineCoveragePolicy);
    const city = { latitude: 0, longitude: 0 };
    const marine = { ...city, days: [{ height: 1.5, period: 10 }] };
    expect(policy.classify(city, null)).toBe('INSUFFICIENT_DATA');
    expect(
      policy.classify(city, {
        ...marine,
        latitude: 10,
        days: [{ height: null, period: 10 }],
      }),
    ).toBe('INSUFFICIENT_DATA');
    expect(policy.classify(city, marine)).toBe('AVAILABLE');
    const degrees = (km: number) => ((km / 6371) * 180) / Math.PI;
    expect(policy.classify(city, { ...marine, latitude: degrees(49.99) })).toBe(
      'AVAILABLE',
    );
    expect(policy.classify(city, { ...marine, latitude: degrees(50.01) })).toBe(
      'NOT_APPLICABLE',
    );
    await module.close();
  });
});
