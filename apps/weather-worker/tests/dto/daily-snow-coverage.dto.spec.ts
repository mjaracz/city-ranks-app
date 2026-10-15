import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DailySnowCoverageDto } from '../../src/dto/daily-snow-coverage.dto';
describe('DailySnowCoverageDto', () => {
  it.each([23, 24, 25])(
    'accepts exactly 24 numeric observations (received %s)',
    (count) => {
      const dto = plainToInstance(DailySnowCoverageDto, {
        observations: Array(count).fill(0),
      });
      expect(validateSync(dto).length === 0).toBe(count === 24);
    },
  );
  it.each([null, NaN, Infinity, '0'])(
    'rejects unavailable and nonnumeric model hours: %s',
    (value) => {
      expect(
        validateSync(
          plainToInstance(DailySnowCoverageDto, {
            observations: [value, ...Array(23).fill(0)],
          }),
        ).length,
      ).toBeGreaterThan(0);
    },
  );
});
