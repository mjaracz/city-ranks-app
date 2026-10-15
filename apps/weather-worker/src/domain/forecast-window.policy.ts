import { Injectable } from '@nestjs/common';
import { addCalendarDays, localDate } from '@libs/models';

@Injectable()
export class ForecastWindowPolicy {
  dates(timezone: string, now = new Date()): string[] {
    // BQ-01: The seven-day window includes today in the resolved city's timezone.
    const start = localDate(now, timezone);
    return Array.from({ length: 7 }, (_, index) =>
      addCalendarDays(start, index),
    );
  }
}
