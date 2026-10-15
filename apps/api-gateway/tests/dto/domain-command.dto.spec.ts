import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CommandCityDto,
  CommandCoordinatesDto,
} from '../../src/dto/domain-command.dto';
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
  it('accepts an omitted coordinate pair or numeric zero, while rejecting partial and coerced pairs', () => {
    expect(validateSync(plainToInstance(CommandCoordinatesDto, {}))).toEqual(
      [],
    );
    expect(
      validateSync(
        plainToInstance(CommandCoordinatesDto, { latitude: 0, longitude: 0 }),
      ),
    ).toEqual([]);
    for (const pair of [
      { latitude: 0 },
      { longitude: 0 },
      { latitude: '0', longitude: 0 },
      { latitude: 91, longitude: 0 },
    ]) {
      expect(
        validateSync(plainToInstance(CommandCoordinatesDto, pair)).length,
      ).toBeGreaterThan(0);
    }
  });
});
