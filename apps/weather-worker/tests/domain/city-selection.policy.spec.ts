import { Test } from '@nestjs/testing';

import { CitySelectionPolicy } from '../../src/domain/city-selection.policy';

describe('CitySelectionPolicy', () => {
  it('selects the first candidate without modifying or combining locations', async () => {
    const module = await Test.createTestingModule({
      providers: [CitySelectionPolicy],
    }).compile();
    const policy = module.get(CitySelectionPolicy);
    const candidates = [{ id: 1 }, { id: 2 }];
    expect(policy.select(candidates)).toBe(candidates[0]);
    expect(candidates).toHaveLength(2);
    expect(() => policy.select([])).toThrow(
      expect.objectContaining({ code: 'CITY_NOT_FOUND' }),
    );
    expect(() => policy.select(undefined)).toThrow(
      expect.objectContaining({ code: 'CITY_NOT_FOUND' }),
    );
    await module.close();
  });
});
