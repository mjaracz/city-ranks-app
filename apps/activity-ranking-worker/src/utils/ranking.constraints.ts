import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

import {
  ActivityEvaluation,
  addCalendarDays,
  CityRanking,
  Completeness,
  DailyCityRanking,
  EvaluationState,
} from '@libs/models';

import { rankDay } from '../domain/daily-ranking';

@ValidatorConstraint({ name: 'dailyRankingConsistency', async: false })
export class DailyRankingConsistency implements ValidatorConstraintInterface {
  validate(
    activities: ActivityEvaluation[],
    { object }: ValidationArguments,
  ): boolean {
    try {
      const day = object as DailyCityRanking;
      const expected = rankDay(day.date, activities);
      return (
        expected.completeness === day.completeness &&
        expected.activities.every((item, index) => {
          const actual = activities[index];
          return (
            item.activity === actual.activity &&
            item.state === actual.state &&
            item.score === actual.score &&
            item.rank === actual.rank
          );
        })
      );
    } catch {
      return false;
    }
  }
}

@ValidatorConstraint({ name: 'rankingWindow', async: false })
export class RankingWindow implements ValidatorConstraintInterface {
  validate(days: DailyCityRanking[], { object }: ValidationArguments): boolean {
    try {
      const ranking = object as CityRanking;
      return (
        ranking.windowEndDate === addCalendarDays(ranking.windowStartDate, 6) &&
        days.every(
          (day, index) =>
            day.date === addCalendarDays(ranking.windowStartDate, index),
        )
      );
    } catch {
      return false;
    }
  }
}

@ValidatorConstraint({ name: 'rankingCompleteness', async: false })
export class RankingCompleteness implements ValidatorConstraintInterface {
  validate(value: Completeness, { object }: ValidationArguments): boolean {
    try {
      const ranking = object as CityRanking;
      const ranked = ranking.days
        .flatMap((day) => day.activities)
        .filter((item) => item.state === EvaluationState.RANKED).length;
      const expected =
        ranked === 0
          ? Completeness.UNAVAILABLE
          : ranked === 28
            ? Completeness.COMPLETE
            : Completeness.PARTIAL;
      return value === expected;
    } catch {
      return false;
    }
  }
}
