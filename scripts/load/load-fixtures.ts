import { createOpenMeteoCurrentRequest } from '../../apps/weather-worker/src/data-providers/open-meteo-request';
import type { ActivityRanking } from '../../apps/activity-ranking-worker/src/activity-ranking.repository';
import { createHash } from 'node:crypto';

export function createLoadFixtures(
  count: number,
  payloadBytes: number,
  runId: string,
) {
  const blob = 'x'.repeat(payloadBytes);
  const latitudeBase =
    10 +
    (createHash('sha256').update(runId).digest().readUInt32BE(0) /
      0x1_0000_0000) *
      50;
  return Array.from({ length: count }, (_, index) => {
    const coordinates = {
      latitude: latitudeBase + Math.floor(index / 1000) / 10_000,
      longitude: -120 + (index % 1000) / 10_000,
    };
    const request = createOpenMeteoCurrentRequest(
      'https://load-fixture.invalid/v1/forecast',
      coordinates,
    );
    const response = {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      current: {
        time: '2026-10-14T12:00',
        temperature_2m: 14.5,
        relative_humidity_2m: 65,
        apparent_temperature: 12.3,
        precipitation: 0.2,
        weather_code: 3,
        wind_speed_10m: 10.5,
        wind_direction_10m: 250,
      },
      benchmarkPayload: blob,
    };
    const ranking: ActivityRanking = {
      city: `load_${runId}_${index}`,
      activity: 'outdoor-sightseeing',
      forecastDate: '2026-10-14',
      score: 70,
      factors: { benchmarkPayload: blob },
      weatherUpdatedAt: new Date('2026-10-14T12:00:00Z'),
      calculatedAt: new Date('2026-10-14T12:00:00Z'),
    };
    return { coordinates, request, response, ranking };
  });
}
