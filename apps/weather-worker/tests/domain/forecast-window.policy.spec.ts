import { Test } from '@nestjs/testing';
import { ForecastWindowPolicy } from '../../src/domain/forecast-window.policy';
describe('ForecastWindowPolicy', () => {
  it('starts seven chronological dates at today in the city timezone, across a year boundary', async () => {
    const module = await Test.createTestingModule({
      providers: [ForecastWindowPolicy],
    }).compile();
    const policy = module.get(ForecastWindowPolicy);
    const now = new Date('2026-12-31T23:30:00Z');
    expect(policy.dates('Europe/Warsaw', now)).toEqual([
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
      '2027-01-04',
      '2027-01-05',
      '2027-01-06',
      '2027-01-07',
    ]);
    expect(policy.dates('America/Los_Angeles', now)[0]).toBe('2026-12-31');
    await module.close();
  });
});
