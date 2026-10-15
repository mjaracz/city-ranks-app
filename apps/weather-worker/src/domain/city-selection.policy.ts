import { Injectable } from '@nestjs/common';

import { CityQueryError } from '@libs/contracts';

@Injectable()
export class CitySelectionPolicy {
  select<T>(cities: readonly T[] | undefined): T {
    const city = cities?.[0];
    if (!city)
      throw new CityQueryError(
        'CITY_NOT_FOUND',
        'No matching city was found; try adding a country or region',
      );
    // BQ-02: Use the first Open-Meteo match and return its identity for disambiguation.
    return city;
  }
}
