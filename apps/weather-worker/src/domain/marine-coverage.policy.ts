import { Injectable } from '@nestjs/common';
import { CityLocation, MarineStatus } from '@libs/models';
import { MarineForecast } from './forecast-source';

@Injectable()
export class MarineCoveragePolicy {
  classify(
    city: Pick<CityLocation, 'latitude' | 'longitude'>,
    marine: MarineForecast | null,
  ): MarineStatus {
    const observed =
      marine?.days.some((day) => day.height !== null && day.period !== null) ??
      false;
    if (!observed) return 'INSUFFICIENT_DATA';
    // BQ-06: Surfing is in scope only when an observed marine grid is within 50 km.
    return this.distanceKilometers(city, marine!) > 50
      ? 'NOT_APPLICABLE'
      : 'AVAILABLE';
  }

  private distanceKilometers(
    a: Pick<CityLocation, 'latitude' | 'longitude'>,
    b: MarineForecast,
  ): number {
    const radians = (value: number) => (value * Math.PI) / 180;
    const angle =
      Math.sin(radians(b.latitude - a.latitude) / 2) ** 2 +
      Math.cos(radians(a.latitude)) *
        Math.cos(radians(b.latitude)) *
        Math.sin(radians(b.longitude - a.longitude) / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, angle)));
  }
}
