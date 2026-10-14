import { createHash } from 'node:crypto';
import type { WeatherApiQuery } from '../weather-api-query-cache.repository';

export function createOpenMeteoCurrentRequest(
  endpoint: string,
  coordinates: { latitude: number; longitude: number },
  apiKey?: string,
): { requestUrl: URL; query: WeatherApiQuery; signature: string } {
  const requestUrl = new URL(endpoint);
  requestUrl.searchParams.set('latitude', String(coordinates.latitude));
  requestUrl.searchParams.set('longitude', String(coordinates.longitude));
  const parameters = {
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'precipitation',
      'weather_code',
      'wind_speed_10m',
      'wind_direction_10m',
    ].join(','),
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
    timezone: 'UTC',
    timeformat: 'iso8601',
  };
  for (const [name, value] of Object.entries(parameters))
    requestUrl.searchParams.set(name, value);
  if (apiKey) requestUrl.searchParams.set('apikey', apiKey);
  const cacheUrl = new URL(requestUrl);
  cacheUrl.searchParams.delete('apikey');
  cacheUrl.searchParams.sort();
  const query = {
    endpoint: `${cacheUrl.origin}${cacheUrl.pathname}`,
    parameters: Object.fromEntries(cacheUrl.searchParams.entries()),
  };
  return {
    requestUrl,
    query,
    signature: createHash('sha256').update(JSON.stringify(query)).digest('hex'),
  };
}
