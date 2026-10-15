import {
  ActivityEvaluation,
  DailyCityRanking,
  EvaluationState,
} from '@libs/models';
import { validateRankingEvaluations } from '../utils/ranking-policy.validation';
import { rankingCompleteness, roundScore } from './ranking-score';

export function rankDay(
  date: string,
  evaluations: ActivityEvaluation[],
): DailyCityRanking {
  validateRankingEvaluations(evaluations);
  const items = evaluations.map((item) =>
    item.state === EvaluationState.RANKED
      ? { ...item, score: roundScore(item.score!), rank: null }
      : { ...item },
  );
  // BQ-03: Round before competition ranking; tied scores share a rank.
  const ranked = items.filter((item) => item.state === EvaluationState.RANKED);
  for (const item of ranked) {
    item.rank = 1 + ranked.filter((other) => other.score! > item.score!).length;
  }
  items.sort(
    (a, b) =>
      (a.rank ?? 5) - (b.rank ?? 5) || a.activity.localeCompare(b.activity),
  );
  return {
    date,
    completeness: rankingCompleteness(ranked.length, 4),
    activities: items,
  };
}
