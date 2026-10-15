import { Test, TestingModule } from '@nestjs/testing';
import { CityQueryError } from '@libs/contracts/city-query';
import { upstreamFixture, testCity } from '../../../city-ranking-test.fixtures';
import { createLoadFixtures } from '../../../../scripts/load/load-fixtures';
import { OpenMeteoResponseParser } from '../../src/services/open-meteo-response-parser.service';

describe('OpenMeteo response field contracts', () => {
  let moduleRef: TestingModule;
  let parser: OpenMeteoResponseParser;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [OpenMeteoResponseParser],
    }).compile();
    parser = moduleRef.get(OpenMeteoResponseParser);
  });
  afterAll(async () => moduleRef.close());

  it.each([
    ['id', '999999'],
    ['id', 0],
    ['latitude', '54.5'],
    ['latitude', 91],
    ['longitude', -181],
    ['name', 12],
    ['name', '   '],
    ['country', null],
    ['country_code', 'pl'],
    ['timezone', 'Unknown/Timezone'],
    ['timezone', 12],
    ['admin1', 12],
  ])('rejects malformed geocoding field %s = %p', (field, value) => {
    const data = upstreamFixture('geocoding');
    const city = (data.results as Record<string, unknown>[])[0];
    city[field] = value;
    expect(() => parser.parseCity(data)).toThrow(CityQueryError);
  });

  it.each([null, undefined, [], 'not-an-object', 5])(
    'rejects a non-object response %p',
    (data) => {
      expect(() => parser.parseCity(data)).toThrow(CityQueryError);
    },
  );

  it('accepts omitted optional region metadata without inventing a region', () => {
    const data = upstreamFixture('geocoding');
    delete (data.results as Record<string, unknown>[])[0].admin1;
    expect(parser.parseCity(data)).toEqual({ ...testCity, region: null });
  });

  it.each([null, {}, 'not-an-array', [null], ['city']])(
    'rejects malformed nested geocoding results %p',
    (results) => {
      expect(() => parser.parseCity({ results })).toThrow(CityQueryError);
    },
  );

  it.each(['18', undefined, null, NaN, Infinity, true])(
    'rejects invalid current temperature %p without coercion',
    (temperature) => {
      const data = structuredClone(
        createLoadFixtures(1, 64, 'dto-test')[0].response,
      );
      (data.current as Record<string, unknown>).temperature_2m = temperature;
      expect(() => parser.parseCurrent(data)).toThrow(CityQueryError);
    },
  );

  it.each([{}, { current: null }, { current: [] }])(
    'rejects missing or malformed nested current weather %p',
    (data) => {
      expect(() => parser.parseCurrent(data)).toThrow(CityQueryError);
    },
  );

  it('accepts API metadata outside the requested contract and preserves strict field types', () => {
    const data = upstreamFixture('geocoding');
    data.generationtime_ms = 0.3;
    expect(parser.parseCity(data)).toEqual(testCity);
    expect(data).toHaveProperty('generationtime_ms', 0.3);
  });
});
