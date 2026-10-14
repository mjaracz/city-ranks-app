import { Test } from '@nestjs/testing';
import { jest } from '@jest/globals';
import type { Collection } from 'mongodb';
import { MongoWeatherApiQueryCacheRepository } from './mongo-weather-api-query-cache.repository';
import { WeatherApiQueryCacheRepository } from './weather-api-query-cache.repository';
import { WeatherPersistenceModule } from './persistence/weather-persistence.module';
import {
  WEATHER_API_CACHE_COLLECTION,
  WEATHER_MONGO_CLIENT,
  WEATHER_MONGO_DATABASE,
  WeatherApiCacheDocument,
} from './persistence/weather-mongo.providers';

type FindCacheDocument = (
  filter: unknown,
) => Promise<{ response: Record<string, unknown>; cachedAt: Date } | null>;

describe('Mongo weather cache repository', () => {
  const signature = 'a'.repeat(64);
  const collection = {
    findOne: jest.fn<FindCacheDocument>(),
    replaceOne: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };
  const repository = new MongoWeatherApiQueryCacheRepository(
    collection as unknown as Collection<WeatherApiCacheDocument>,
  );
  beforeEach(() => jest.clearAllMocks());

  it('requires fresh entries independently of asynchronous TTL deletion', async () => {
    collection.findOne.mockResolvedValue({
      response: { value: 1 },
      cachedAt: new Date(),
    });
    expect(await repository.findFresh(signature)).toMatchObject({
      response: { value: 1 },
    });
    expect(collection.findOne.mock.calls[0][0]).toEqual({
      _id: signature,
      expiresAt: { $gt: expect.any(Date) },
    });
  });

  it('uses an atomic document upsert', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    await repository.save(
      signature,
      { endpoint: 'https://example.invalid', parameters: { latitude: '1' } },
      { value: 1 },
      expiresAt,
    );
    expect(collection.replaceOne).toHaveBeenCalledWith(
      { _id: signature },
      expect.objectContaining({
        expiresAt,
        response: { value: 1 },
      }),
      { upsert: true },
    );
  });

  it('rejects Mongo operator input and expired writes', async () => {
    await expect(
      repository.findFresh({ $ne: null } as unknown as string),
    ).rejects.toThrow();
    await expect(
      repository.save(
        signature,
        { endpoint: '', parameters: {} },
        {},
        new Date(0),
      ),
    ).rejects.toThrow();
    expect(collection.findOne).not.toHaveBeenCalled();
    expect(collection.replaceOne).not.toHaveBeenCalled();
  });

  it('resolves the domain port through the injected collection', async () => {
    const module = await Test.createTestingModule({
      imports: [WeatherPersistenceModule],
    })
      .overrideProvider(WEATHER_API_CACHE_COLLECTION)
      .useValue(collection)
      .overrideProvider(WEATHER_MONGO_CLIENT)
      .useValue({ close: jest.fn() })
      .overrideProvider(WEATHER_MONGO_DATABASE)
      .useValue({})
      .compile();
    expect(module.get(WeatherApiQueryCacheRepository)).toBeInstanceOf(
      MongoWeatherApiQueryCacheRepository,
    );
    await module.close();
  });
});
