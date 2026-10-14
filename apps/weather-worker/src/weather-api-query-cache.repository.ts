export interface WeatherApiQuery {
  endpoint: string;
  parameters: Record<string, string>;
}

export interface CachedWeatherApiResponse {
  response: Record<string, unknown>;
  cachedAt: Date;
  expiresAt?: Date;
}

export abstract class WeatherApiQueryCacheRepository {
  abstract findFresh(
    querySignature: string,
  ): Promise<CachedWeatherApiResponse | null>;

  abstract save(
    querySignature: string,
    query: WeatherApiQuery,
    response: Record<string, unknown>,
    expiresAt: Date,
    cachedAt?: Date,
  ): Promise<void>;
}
