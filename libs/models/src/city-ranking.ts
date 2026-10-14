export enum Activity {
  SKIING = 'SKIING',
  SURFING = 'SURFING',
  OUTDOOR_SIGHTSEEING = 'OUTDOOR_SIGHTSEEING',
  INDOOR_SIGHTSEEING = 'INDOOR_SIGHTSEEING',
}

export enum EvaluationState {
  RANKED = 'RANKED',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  NOT_APPLICABLE = 'NOT_APPLICABLE',
}

export enum Completeness {
  COMPLETE = 'COMPLETE',
  PARTIAL = 'PARTIAL',
  UNAVAILABLE = 'UNAVAILABLE',
}

export interface CityLocation {
  id: string;
  name: string;
  countryCode: string;
  country: string;
  region: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface ActivityEvaluation {
  activity: Activity;
  state: EvaluationState;
  score: number | null;
  rank: number | null;
  reasonCodes: string[];
  explanation: string;
}

export interface DailyCityRanking {
  date: string;
  completeness: Completeness;
  activities: ActivityEvaluation[];
}

export interface CityRanking {
  id: string;
  city: CityLocation;
  windowStartDate: string;
  windowEndDate: string;
  completeness: Completeness;
  policyVersion: string;
  forecastSnapshotId: string;
  weatherFetchedAt: string;
  marineFetchedAt: string | null;
  freshUntil: string;
  computedAt: string;
  days: DailyCityRanking[];
}
