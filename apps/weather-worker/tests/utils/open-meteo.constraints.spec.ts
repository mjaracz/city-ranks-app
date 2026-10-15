import { WeatherPolicyModule } from '../../src/domain/weather-policy.module';
import { Test, TestingModule } from '@nestjs/testing';
import { CityQueryError } from '@libs/contracts/city-query';
import {
  forecastFixture,
  testCity,
  upstreamFixture,
} from '../../../city-ranking-test.fixtures';
import { OpenMeteoResponseParser } from '../../src/services/open-meteo-response-parser.service';

describe('OpenMeteo observation consistency', () => {
  let moduleRef: TestingModule;
  let parser: OpenMeteoResponseParser;
  const dates = () => forecastFixture().days.map((day) => day.date);

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [WeatherPolicyModule],
      providers: [OpenMeteoResponseParser],
    }).compile();
    parser = moduleRef.get(OpenMeteoResponseParser);
  });
  afterAll(async () => moduleRef.close());

  it.each([
    ['temperature_2m_min', -101],
    ['temperature_2m_max', 71],
    ['precipitation_sum', -1],
    ['precipitation_sum', 3001],
    ['snowfall_sum', 1001],
    ['wind_speed_10m_max', 501],
    ['weather_code', 98],
    ['weather_code', '0'],
    ['precipitation_sum', '0'],
    ['precipitation_sum', undefined],
    ['precipitation_sum', NaN],
    ['precipitation_sum', Infinity],
    ['precipitation_sum', false],
    ['precipitation_sum', {}],
  ])('rejects invalid %s observation %p', (field, value) => {
    const data = upstreamFixture('forecast');
    (data.daily as Record<string, unknown[]>)[field][0] = value;
    expect(() => parser.parseWeather(data, dates(), testCity.timezone)).toThrow(
      CityQueryError,
    );
  });

  it('preserves zero as measured data and null as a missing observation', () => {
    const data = upstreamFixture('forecast');
    const daily = data.daily as Record<string, unknown[]>;
    daily.precipitation_sum[0] = null;
    daily.temperature_2m_min[0] = null;
    daily.weather_code[0] = null;
    const result = parser.parseWeather(data, dates(), testCity.timezone);
    expect(result[0]).toMatchObject({
      precipitationMillimeters: null,
      temperatureMinCelsius: null,
      weatherCode: null,
      snowfallCentimeters: 0,
      snowDepthMaxMeters: 0,
    });
    expect(result[1]).toMatchObject({
      precipitationMillimeters: 0,
      weatherCode: 0,
    });
  });

  it.each([undefined, null, 0, []])(
    'rejects an absent or inconsistent measurement column %p',
    (column) => {
      const data = upstreamFixture('forecast');
      (data.daily as Record<string, unknown>).precipitation_sum = column;
      expect(() =>
        parser.parseWeather(data, dates(), testCity.timezone),
      ).toThrow(CityQueryError);
    },
  );

  it('rejects a temperature minimum exceeding its matching maximum', () => {
    const data = upstreamFixture('forecast');
    (data.daily as Record<string, unknown[]>).temperature_2m_min[0] = 30;
    expect(() => parser.parseWeather(data, dates(), testCity.timezone)).toThrow(
      CityQueryError,
    );
  });

  it.each(['2026-02-30', '2026-01-01T00:00:00Z', 20260101])(
    'rejects invalid calendar date %p',
    (date) => {
      const data = upstreamFixture('forecast');
      (data.daily as Record<string, unknown[]>).time[0] = date;
      expect(() =>
        parser.parseWeather(data, dates(), testCity.timezone),
      ).toThrow(CityQueryError);
    },
  );

  it('rejects duplicate forecast dates', () => {
    const data = upstreamFixture('forecast');
    const time = (data.daily as Record<string, unknown[]>).time;
    time[1] = time[0];
    expect(() => parser.parseWeather(data, dates(), testCity.timezone)).toThrow(
      CityQueryError,
    );
  });

  it.each(['2026-02-30T00:00', '2026-01-01T24:00', 20260101])(
    'rejects invalid hourly date %p',
    (time) => {
      const data = upstreamFixture('forecast');
      (data.hourly as Record<string, unknown[]>).time[0] = time;
      expect(() =>
        parser.parseWeather(data, dates(), testCity.timezone),
      ).toThrow(CityQueryError);
    },
  );

  it('rejects mismatched hourly columns and repeated hours', () => {
    const data = upstreamFixture('forecast');
    const hourly = data.hourly as Record<string, unknown[]>;
    hourly.snow_depth.pop();
    expect(() => parser.parseWeather(data, dates(), testCity.timezone)).toThrow(
      CityQueryError,
    );
    hourly.time.pop();
    hourly.time[1] = hourly.time[0];
    expect(() => parser.parseWeather(data, dates(), testCity.timezone)).toThrow(
      CityQueryError,
    );
  });

  it.each([-1, 101, '0', undefined])(
    'rejects invalid snow depth %p',
    (depth) => {
      const data = upstreamFixture('forecast');
      (data.hourly as Record<string, unknown[]>).snow_depth[0] = depth;
      expect(() =>
        parser.parseWeather(data, dates(), testCity.timezone),
      ).toThrow(CityQueryError);
    },
  );

  it.each([-1, 101, '1.5', undefined])(
    'rejects invalid marine wave height %p',
    (height) => {
      const data = upstreamFixture('marine');
      (data.daily as Record<string, unknown[]>).wave_height_max[0] = height;
      expect(() =>
        parser.parseMarine(data, dates(), testCity.timezone),
      ).toThrow(CityQueryError);
    },
  );
});
