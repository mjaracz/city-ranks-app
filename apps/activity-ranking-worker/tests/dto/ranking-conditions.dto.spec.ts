import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { forecastFixture } from '../../../city-ranking-test.fixtures';
import {
  OutdoorRankingConditionsDto,
  SkiingRankingConditionsDto,
  SurfingRankingConditionsDto,
} from '../../src/dto/ranking-conditions.dto';

const definitions: readonly [ClassConstructor<object>, readonly string[]][] = [
  [
    OutdoorRankingConditionsDto,
    [
      'temperatureMinCelsius',
      'temperatureMaxCelsius',
      'precipitationMillimeters',
      'windSpeedMaxKilometersPerHour',
      'weatherCode',
    ],
  ],
  [
    SkiingRankingConditionsDto,
    [
      'temperatureMinCelsius',
      'temperatureMaxCelsius',
      'snowDepthMaxMeters',
      'snowfallCentimeters',
      'windSpeedMaxKilometersPerHour',
      'weatherCode',
    ],
  ],
  [
    SurfingRankingConditionsDto,
    [
      'waveHeightMaxMeters',
      'wavePeriodMaxSeconds',
      'windSpeedMaxKilometersPerHour',
      'weatherCode',
    ],
  ],
];

for (const [Dto, fields] of definitions) {
  describe(Dto.name, () => {
    const validate = (input: object) =>
      validateSync(
        plainToInstance(Dto, input, { enableImplicitConversion: false }),
      );
    it('accepts finite observations including zero', () => {
      expect(
        validate(Object.fromEntries(fields.map((field) => [field, 0]))),
      ).toEqual([]);
    });
    for (const field of fields) {
      it.each([null, undefined, '0', NaN, Infinity, -Infinity])(
        'rejects unavailable or nonnumeric ' + field + ': %s',
        (value) => {
          expect(
            validate({ ...forecastFixture().days[0], [field]: value }).length,
          ).toBeGreaterThan(0);
        },
      );
    }
  });
}
