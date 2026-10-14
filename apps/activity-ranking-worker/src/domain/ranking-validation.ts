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
  if (
    !ranking ||
    !/^[a-f0-9]{64}$/.test(ranking.id) ||
    !ranking.city?.id ||
    !ranking.policyVersion ||
    !ranking.forecastSnapshotId ||
    !isCalendarDate(ranking.windowStartDate) ||
    ranking.windowEndDate !== addCalendarDays(ranking.windowStartDate, 6)
  )
    invalid();
  if (
    ![ranking.weatherFetchedAt, ranking.freshUntil, ranking.computedAt].every(
      (value) =>
        typeof value === 'string' && Number.isFinite(Date.parse(value)),
    ) ||
    (ranking.marineFetchedAt !== null &&
      !Number.isFinite(Date.parse(ranking.marineFetchedAt)))
  )
    invalid();
  if (!Array.isArray(ranking.days) || ranking.days.length !== 7) invalid();
  let ranked = 0;
  ranking.days.forEach((day, index) => {
    if (
      !day ||
      day.date !== addCalendarDays(ranking.windowStartDate, index) ||
      !Array.isArray(day.activities)
    )
      invalid();
    for (const item of day.activities) {
      if (
        !item ||
        typeof item.explanation !== 'string' ||
        !item.explanation.trim() ||
        !Array.isArray(item.reasonCodes) ||
        !item.reasonCodes.length ||
        !item.reasonCodes.every(
          (code) => typeof code === 'string' && code.trim(),
        )
      )
        invalid();
    }
    const expected = rankDay(day.date, day.activities);
    if (
      expected.completeness !== day.completeness ||
      expected.activities.some((item, i) => {
        const actual = day.activities[i];
        return (
          item.activity !== actual.activity ||
          item.state !== actual.state ||
          item.score !== actual.score ||
          item.rank !== actual.rank
        );
      })
    )
      invalid();
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
