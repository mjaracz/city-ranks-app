import {
  Field,
  Float,
  ID,
  Int,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';

import {
  Activity,
  ActivityEvaluation,
  CityLocation,
  CityRanking,
  Completeness,
  DailyCityRanking,
  EvaluationState,
} from '@libs/models';

registerEnumType(Activity, { name: 'Activity' });
registerEnumType(EvaluationState, { name: 'EvaluationState' });
registerEnumType(Completeness, { name: 'RankingCompleteness' });

@ObjectType('CityLocation')
export class CityLocationType implements CityLocation {
  @Field(() => ID) id: string;
  @Field() name: string;
  @Field() countryCode: string;
  @Field() country: string;
  @Field(() => String, { nullable: true }) region: string | null;
  @Field(() => Float) latitude: number;
  @Field(() => Float) longitude: number;
  @Field() timezone: string;
}

@ObjectType('ActivityEvaluation')
export class ActivityEvaluationType implements ActivityEvaluation {
  @Field(() => Activity) activity: Activity;
  @Field(() => EvaluationState) state: EvaluationState;
  @Field(() => Float, { nullable: true }) score: number | null;
  @Field(() => Int, { nullable: true }) rank: number | null;
  @Field(() => [String]) reasonCodes: string[];
  @Field() explanation: string;
}

@ObjectType('DailyCityRanking')
export class DailyCityRankingType implements DailyCityRanking {
  @Field() date: string;
  @Field(() => Completeness) completeness: Completeness;
  @Field(() => [ActivityEvaluationType]) activities: ActivityEvaluationType[];
}

@ObjectType('CityRanking')
export class CityRankingType implements CityRanking {
  @Field(() => ID) id: string;
  @Field(() => CityLocationType) city: CityLocationType;
  @Field() windowStartDate: string;
  @Field() windowEndDate: string;
  @Field(() => Completeness) completeness: Completeness;
  @Field() policyVersion: string;
  @Field(() => ID) forecastSnapshotId: string;
  @Field() weatherFetchedAt: string;
  @Field(() => String, { nullable: true }) marineFetchedAt: string | null;
  @Field() freshUntil: string;
  @Field() computedAt: string;
  @Field(() => [DailyCityRankingType]) days: DailyCityRankingType[];
}
