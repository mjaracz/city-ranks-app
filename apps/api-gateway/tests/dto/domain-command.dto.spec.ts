import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { CommandCityDto } from '../../src/dto/domain-command.dto';

describe('Command DTOs', () => {
  it('trims command city names and preserves the existing 1-120 character contract', () => {
    const dto = plainToInstance(CommandCityDto, { city: ' A ' });
    expect(dto.city).toBe('A');
    expect(validateSync(dto)).toEqual([]);
    for (const city of [null, 1, '', ' '.repeat(5), 'x'.repeat(121)]) {
      expect(
        validateSync(plainToInstance(CommandCityDto, { city })).length,
      ).toBeGreaterThan(0);
    }
  });
});
