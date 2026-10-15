import { Test } from '@nestjs/testing';
import { WeatherInputValidator } from '../../src/utils/weather-input.validator';
import { OpenMeteoCurrentResponseDto } from '../../src/dto/open-meteo-response.dto';
import { DailySnowCoverageDto } from '../../src/dto/daily-snow-coverage.dto';
describe('WeatherInputValidator', () => {
  it('rejects malformed payloads without leaking values and never converts numeric strings', async () => {
    const module = await Test.createTestingModule({
      providers: [WeatherInputValidator],
    }).compile();
    const validation = module.get(WeatherInputValidator);
    for (const input of [
      null,
      undefined,
      [],
      'invalid',
      { current: { temperature_2m: '20' } },
    ]) {
      expect(
        validation.tryTransform(OpenMeteoCurrentResponseDto, input),
      ).toBeNull();
      expect(() =>
        validation.transform(OpenMeteoCurrentResponseDto, input),
      ).toThrow(expect.objectContaining({ code: 'UPSTREAM_UNAVAILABLE' }));
    }
    expect(
      validation.transform(DailySnowCoverageDto, {
        observations: Array(24).fill(0),
      }).observations,
    ).toEqual(Array(24).fill(0));
    await module.close();
  });
});
