import type { ActivityRanking } from './activity-ranking.repository';

const activities = new Set([
  'skiing',
  'surfing',
  'outdoor-sightseeing',
  'indoor-sightseeing',
]);

export function validateCity(city: string): void {
  const isInvalidCity =
    typeof city !== 'string' || city.trim().length === 0 || city.length > 120;
  if (isInvalidCity) {
    throw new RangeError('City must contain 1 to 120 characters');
  }
}

function validateDate(date: string): void {
  const isInvalidDate =
    typeof date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date;
  if (isInvalidDate) {
    throw new RangeError('Ranking dates must use valid YYYY-MM-DD values');
  }
}

export function validateRankingPeriod(
  city: string,
  from: string,
  until: string,
): void {
  validateCity(city);
  validateDate(from);
  validateDate(until);
  const days = (Date.parse(until) - Date.parse(from)) / 86_400_000;
  if (days <= 0 || days > 31) {
    throw new RangeError(
      'Ranking period must contain 1 to 31 days, with an exclusive end date',
    );
  }
}

export function validateRankings(rankings: readonly ActivityRanking[]): void {
  if (!Array.isArray(rankings) || rankings.length > 1000) {
    throw new RangeError('A ranking batch must contain at most 1000 records');
  }
  for (const ranking of rankings) {
    if (!ranking || typeof ranking !== 'object')
      throw new RangeError('Invalid ranking record');
    validateCity(ranking.city);
    validateDate(ranking.forecastDate);
    const isInvalidActivityOrScore =
      !activities.has(ranking.activity) ||
      !Number.isFinite(ranking.score) ||
      ranking.score < 0 ||
      ranking.score > 100;
    if (isInvalidActivityOrScore) {
      throw new RangeError('Ranking activity or score is invalid');
    }
    const hasInvalidFactors =
      !ranking.factors ||
      typeof ranking.factors !== 'object' ||
      Array.isArray(ranking.factors);
    if (hasInvalidFactors) {
      throw new RangeError('Ranking factors must be an object');
    }
    const hasInvalidFactorValues = Object.values(ranking.factors).some(
      (value) =>
        (value !== null &&
          !['string', 'number', 'boolean'].includes(typeof value)) ||
        (typeof value === 'number' && !Number.isFinite(value)),
    );
    if (hasInvalidFactorValues) {
      throw new RangeError('Ranking factors must contain finite scalar values');
    }
    const hasInvalidTimestamps =
      !(ranking.calculatedAt instanceof Date) ||
      !Number.isFinite(ranking.calculatedAt.getTime()) ||
      (ranking.weatherUpdatedAt !== null &&
        (!(ranking.weatherUpdatedAt instanceof Date) ||
          !Number.isFinite(ranking.weatherUpdatedAt.getTime())));
    if (hasInvalidTimestamps) {
      throw new RangeError('Ranking timestamps must be valid dates');
    }
  }
}
