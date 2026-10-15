import { Test, TestingModule } from '@nestjs/testing';
import {
  forecastFixture,
  testCity,
  upstreamFixture,
} from '../../../city-ranking-test.fixtures';
import { OpenMeteoResponseParser } from '../../src/services/open-meteo-response-parser.service';

describe('OpenMeteoResponseParser', () => {
  let moduleRef: TestingModule;
  let parser: OpenMeteoResponseParser;
  const dates = () => forecastFixture().days.map((day) => day.date);

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [OpenMeteoResponseParser],
    }).compile();
    parser = moduleRef.get(OpenMeteoResponseParser);
  });
  afterAll(async () => moduleRef.close());

  it('maps the resolved city identity and location metadata to the shared model', () => {
    expect(parser.parseCity(upstreamFixture('geocoding'))).toEqual(testCity);
  });

  it.each([{}, { results: [] }])(
    'reports a missing city as CITY_NOT_FOUND for %p',
    (response) => {
      expect(() => parser.parseCity(response)).toThrow(
        expect.objectContaining({ code: 'CITY_NOT_FOUND' }),
      );
    },
  );

  it('maps daily weather measurements to the seven requested dates', () => {
    const weather = parser.parseWeather(
      upstreamFixture('forecast'),
      dates(),
      testCity.timezone,
    );
    expect(weather).toHaveLength(7);
    expect(weather[0]).toEqual({
      ...forecastFixture().days[0],
      waveHeightMaxMeters: null,
      wavePeriodMaxSeconds: null,
    });
  });

  it('keeps unavailable dates and incomplete snow coverage as missing data', () => {
    const data = upstreamFixture('forecast');
    const daily = data.daily as Record<string, unknown[]>;
    for (const key of Object.keys(daily)) daily[key] = daily[key].slice(1);
    const hourly = data.hourly as Record<string, unknown[]>;
    hourly.time = hourly.time.slice(1);
    hourly.snow_depth = hourly.snow_depth.slice(1);
    expect(
      parser.parseWeather(data, dates(), testCity.timezone)[0],
    ).toMatchObject({
      temperatureMinCelsius: null,
      snowDepthMaxMeters: null,
    });
  });

  it('requires all model hours to contain snow measurements before reporting a daily depth', () => {
    const data = upstreamFixture('forecast');
    (data.hourly as Record<string, unknown[]>).snow_depth[0] = null;
    const days = parser.parseWeather(data, dates(), testCity.timezone);
    expect(days[0].snowDepthMaxMeters).toBeNull();
    expect(days[1].snowDepthMaxMeters).toBe(0);
  });

  it('maps marine measurements and preserves missing waves', () => {
    const data = upstreamFixture('marine');
    (data.daily as Record<string, unknown[]>).wave_height_max[0] = null;
    const marine = parser.parseMarine(data, dates(), testCity.timezone);
    expect(marine).toMatchObject({
      latitude: testCity.latitude,
      longitude: testCity.longitude,
    });
    expect(marine.days[0]).toEqual({ height: null, period: 10 });
    expect(marine.days[1]).toEqual({ height: 1.5, period: 10 });
  });

  it.each(['forecast', 'marine'] as const)(
    'rejects %s measurements returned for a different timezone',
    (kind) => {
      const data = upstreamFixture(kind);
      data.timezone = 'UTC';
      expect(() =>
        kind === 'forecast'
          ? parser.parseWeather(data, dates(), testCity.timezone)
          : parser.parseMarine(data, dates(), testCity.timezone),
      ).toThrow(expect.objectContaining({ code: 'UPSTREAM_UNAVAILABLE' }));
    },
  );
});
