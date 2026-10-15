import {
  CityRanking,
  Completeness,
  EvaluationState,
  addCalendarDays,
  isCalendarDate,
} from '../../../../libs/models/src';
import { rankDay } from './ranking-policy';

export function validateCityRanking(ranking: CityRanking): void {
  const invalid = () => {
    throw new RangeError('Invalid complete city ranking');
  };
  const hasInvalidRankingMetadata =
    !ranking ||
    !/^[a-f0-9]{64}$/.test(ranking.id) ||
    !ranking.city?.id ||
    !ranking.policyVersion ||
    !ranking.forecastSnapshotId ||
    !isCalendarDate(ranking.windowStartDate) ||
    ranking.windowEndDate !== addCalendarDays(ranking.windowStartDate, 6);
  if (hasInvalidRankingMetadata) invalid();
  const hasInvalidRankingTimestamps =
    ![ranking.weatherFetchedAt, ranking.freshUntil, ranking.computedAt].every(
      (value) =>
        typeof value === 'string' && Number.isFinite(Date.parse(value)),
    ) ||
    (ranking.marineFetchedAt !== null &&
      !Number.isFinite(Date.parse(ranking.marineFetchedAt)));
  if (hasInvalidRankingTimestamps) invalid();
  if (!Array.isArray(ranking.days) || ranking.days.length !== 7) invalid();
  let ranked = 0;
  ranking.days.forEach((day, index) => {
    const hasInvalidDailyRankingDay =
      !day ||
      day.date !== addCalendarDays(ranking.windowStartDate, index) ||
      !Array.isArray(day.activities);
    if (hasInvalidDailyRankingDay) invalid();
    for (const item of day.activities) {
      const hasInvalidActivityExplanation =
        !item ||
        typeof item.explanation !== 'string' ||
        !item.explanation.trim() ||
        !Array.isArray(item.reasonCodes) ||
        !item.reasonCodes.length ||
        !item.reasonCodes.every(
          (code) => typeof code === 'string' && code.trim(),
        );
      if (hasInvalidActivityExplanation) invalid();
    }
    const expected = rankDay(day.date, day.activities);
    const hasInconsistentDailyRanking =
      expected.completeness !== day.completeness ||
      expected.activities.some((item, i) => {
        const actual = day.activities[i];
        return (
          item.activity !== actual.activity ||
          item.state !== actual.state ||
          item.score !== actual.score ||
          item.rank !== actual.rank
        );
      });
    if (hasInconsistentDailyRanking) invalid();
    ranked += day.activities.filter(
      (item) => item.state === EvaluationState.RANKED,
    ).length;
  });
  const completeness =
    ranked === 0
      ? Completeness.UNAVAILABLE
      : ranked === 28
        ? Completeness.COMPLETE
        : Completeness.PARTIAL;
  if (ranking.completeness !== completeness) invalid();
}
