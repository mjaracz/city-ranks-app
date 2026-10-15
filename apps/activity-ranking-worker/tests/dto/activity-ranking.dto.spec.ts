import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { ActivityRankingBatchDto } from '../../src/dto/activity-ranking.dto';

describe('Activity ranking DTO', () => {
  const transform = (score: unknown) =>
    plainToInstance(
      ActivityRankingBatchDto,
      {
        rankings: [
          {
            city: 'Warsaw',
            activity: 'surfing',
            forecastDate: '2026-10-14',
            score,
            factors: { sea: 0, accessible: true, source: 'marine', gap: null },
            weatherUpdatedAt: null,
            calculatedAt: new Date('2026-10-14T09:00:00Z'),
          },
        ],
      },
      { excludeExtraneousValues: true, enableImplicitConversion: false },
    );

  it('preserves dynamic scalar factors and actual date instances', () => {
    const batch = transform(0);
    expect(validateSync(batch)).toEqual([]);
    expect(batch.rankings[0].factors).toEqual({
      sea: 0,
      accessible: true,
      source: 'marine',
      gap: null,
    });
    expect(batch.rankings[0].calculatedAt).toEqual(
      new Date('2026-10-14T09:00:00Z'),
    );
    expect(batch.rankings[0].weatherUpdatedAt).toBeNull();
  });

  it('rejects a numeric string in a nested ranking instead of converting it', () => {
    const batch = transform('80');
    expect(batch.rankings[0].score).toBe('80');
    expect(validateSync(batch)).not.toEqual([]);
  });
});
