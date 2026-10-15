import { createHash } from 'node:crypto';
import {
  Activity,
  ActivityEvaluation,
  CityForecast,
  CityRanking,
  Completeness,
  DailyCityRanking,
  DailyWeatherForecast,
  EvaluationState,
} from '../../../../libs/models/src';

// BQ-03/BQ-04: Scores describe provisional weather preference on a shared 0-100 scale.
export const RANKING_POLICY_VERSION = 'weather-suitability-v1';
const activities = Object.values(Activity);
const clamp = (value: number) => Math.max(0, Math.min(100, value));
const round = (value: number) => {
  const [coefficient, exponent = '0'] = clamp(value).toString().split('e');
  return Number(
    `${Math.round(Number(`${coefficient}e${Number(exponent) + 2}`))}e-2`,
  );
};
const available = (...values: (number | null)[]) =>
  values.every((value) => typeof value === 'number' && Number.isFinite(value));
const storm = (code: number | null) => code !== null && code >= 95;

function unavailable(
  activity: Activity,
  state: EvaluationState,
  reason: string,
  explanation: string,
): ActivityEvaluation {
  return {
    activity,
    state,
    score: null,
    rank: null,
    reasonCodes: [`v1.${reason}`],
    explanation,
  };
}

function scored(
  activity: Activity,
  score: number,
  reason: string,
  explanation: string,
): ActivityEvaluation {
  return {
    activity,
    state: EvaluationState.RANKED,
    score: round(score),
    rank: null,
    reasonCodes: [`v1.${reason}`],
    explanation,
  };
}

// BQ-04: Provisional comfort target is 20 C; rain and high wind reduce preference.
function outdoorScore(day: DailyWeatherForecast): number {
  const temperature =
    (day.temperatureMinCelsius! + day.temperatureMaxCelsius!) / 2;
  return clamp(
    100 -
      3 * Math.abs(temperature - 20) -
      5 * day.precipitationMillimeters! -
      Math.max(0, day.windSpeedMaxKilometersPerHour! - 15) * 1.5,
  );
}

export function evaluateActivities(
  day: DailyWeatherForecast,
  marineStatus: CityForecast['marineStatus'],
): ActivityEvaluation[] {
  // BQ-10: Should unknown observations exclude an activity or imply pessimistic suitability?
  const missing = (activity: Activity) =>
    unavailable(
      activity,
      EvaluationState.INSUFFICIENT_DATA,
      'missing-observations',
      'Required weather observations are unavailable for this day.',
    );
  const outdoorAvailable = available(
    day.temperatureMinCelsius,
    day.temperatureMaxCelsius,
    day.precipitationMillimeters,
    day.windSpeedMaxKilometersPerHour,
    day.weatherCode,
  );
  const outdoor = outdoorAvailable
    ? scored(
        Activity.OUTDOOR_SIGHTSEEING,
        storm(day.weatherCode) ? 0 : outdoorScore(day),
        storm(day.weatherCode) ? 'thunderstorm' : 'outdoor-comfort',
        storm(day.weatherCode)
          ? 'Thunderstorms make outdoor weather unsuitable.'
          : 'Mild temperatures, low precipitation and light wind favor outdoor sightseeing.',
      )
    : missing(Activity.OUTDOOR_SIGHTSEEING);
  // BQ-07: Indoor preference has a baseline of 40 and rises as outdoor weather worsens.
  const indoor = outdoorAvailable
    ? scored(
        Activity.INDOOR_SIGHTSEEING,
        40 + 0.6 * (100 - outdoor.score!),
        'indoor-alternative',
        'Indoor sightseeing remains an option and is preferred more strongly when outdoor weather is poor; venue availability is not assessed.',
      )
    : missing(Activity.INDOOR_SIGHTSEEING);
  let skiing: ActivityEvaluation;
  const hasInsufficientSkiingData = !available(
    day.temperatureMinCelsius,
    day.temperatureMaxCelsius,
    day.snowDepthMaxMeters,
    day.snowfallCentimeters,
    day.windSpeedMaxKilometersPerHour,
    day.weatherCode,
  );
  if (hasInsufficientSkiingData) {
    skiing = missing(Activity.SKIING);
  } else {
    // BQ-05: City-grid snow depth is a proxy; this does not establish a ski facility.
    const snow = Math.min(1, day.snowDepthMaxMeters! / 0.3);
    const temperature =
      (day.temperatureMinCelsius! + day.temperatureMaxCelsius!) / 2;
    const comfort = clamp(
      100 -
        5 * Math.abs(temperature + 5) -
        2 * Math.max(0, day.windSpeedMaxKilometersPerHour! - 20) -
        2 * Math.max(0, day.snowfallCentimeters! - 10),
    );
    skiing = scored(
      Activity.SKIING,
      storm(day.weatherCode) ? 0 : snow * comfort,
      storm(day.weatherCode)
        ? 'thunderstorm'
        : snow === 0
          ? 'no-snow-cover'
          : 'ski-weather',
      'Snow cover, cold temperatures and moderate wind determine skiing weather suitability at the city grid; resorts and slope conditions are not assessed.',
    );
  }
  const isSurfingUnavailable =
    marineStatus !== 'AVAILABLE' ||
    !available(
      day.waveHeightMaxMeters,
      day.wavePeriodMaxSeconds,
      day.windSpeedMaxKilometersPerHour,
      day.weatherCode,
    );
  let surfing: ActivityEvaluation;
  if (marineStatus === 'NOT_APPLICABLE') {
    surfing = unavailable(
      Activity.SURFING,
      EvaluationState.NOT_APPLICABLE,
      'marine-grid-outside-city',
      'The available marine grid is more than 50 km from the city, outside this policy evaluation radius.',
    );
  } else if (isSurfingUnavailable) {
    surfing = missing(Activity.SURFING);
  } else {
    // BQ-06: Daily wave maxima are a heuristic, with a provisional target of 1.5 m.
    const wave = clamp(
      100 - Math.abs(day.waveHeightMaxMeters! - 1.5) * (100 / 1.5),
    );
    const period = Math.min(1, day.wavePeriodMaxSeconds! / 10);
    const wind =
      clamp(100 - 3 * Math.max(0, day.windSpeedMaxKilometersPerHour! - 15)) /
      100;
    surfing = scored(
      Activity.SURFING,
      storm(day.weatherCode) ? 0 : wave * period * wind,
      storm(day.weatherCode) ? 'thunderstorm' : 'surf-weather',
      storm(day.weatherCode)
        ? 'Thunderstorms make surfing weather unsuitable.'
        : 'Moderate waves, longer wave periods and light wind favor surfing weather; beach access, tides and local hazards are not assessed.',
    );
  }
  return [skiing, surfing, outdoor, indoor];
}

export function rankDay(
  date: string,
  evaluations: ActivityEvaluation[],
): DailyCityRanking {
  const hasInvalidActivityEvaluations =
    evaluations.length !== 4 ||
    new Set(evaluations.map((item) => item.activity)).size !== 4 ||
    evaluations.some((item) => !activities.includes(item.activity));
  if (hasInvalidActivityEvaluations) {
    throw new RangeError(
      'Each day must contain the four supported activities exactly once',
    );
  }
  const items = evaluations.map((item) => {
    if (item.state === EvaluationState.RANKED) {
      const hasInvalidRankedScore =
        !Number.isFinite(item.score) ||
        item.score === null ||
        item.score < 0 ||
        item.score > 100;
      if (hasInvalidRankedScore)
        throw new RangeError(
          'Ranked scores must be finite numbers between 0 and 100',
        );
      return { ...item, score: round(item.score), rank: null };
    }
    const hasInvalidUnavailableEvaluation =
      item.score !== null ||
      item.rank !== null ||
      !Object.values(EvaluationState).includes(item.state);
    if (hasInvalidUnavailableEvaluation)
      throw new RangeError(
        'Unavailable evaluations must have null score and rank',
      );
    return { ...item };
  });
  // BQ-03: Round before competition ranking; tied scores share a rank.
  const ranked = items.filter((item) => item.state === EvaluationState.RANKED);
  for (const item of ranked)
    item.rank = 1 + ranked.filter((other) => other.score! > item.score!).length;
  items.sort(
    (a, b) =>
      (a.rank ?? 5) - (b.rank ?? 5) || a.activity.localeCompare(b.activity),
  );
  return {
    date,
    completeness: completeness(ranked.length, 4),
    activities: items,
  };
}

function completeness(count: number, total: number): Completeness {
  return count === 0
    ? Completeness.UNAVAILABLE
    : count === total
      ? Completeness.COMPLETE
      : Completeness.PARTIAL;
}

export function calculateCityRanking(
  forecast: CityForecast,
  computedAt = new Date(),
): CityRanking {
  if (forecast.days.length !== 7)
    throw new RangeError('A city forecast must contain seven days');
  const days = forecast.days.map((day) =>
    rankDay(day.date, evaluateActivities(day, forecast.marineStatus)),
  );
  const id = createHash('sha256')
    .update(`${forecast.snapshotId}:${RANKING_POLICY_VERSION}`)
    .digest('hex');
  return {
    id,
    city: forecast.city,
    windowStartDate: days[0].date,
    windowEndDate: days[6].date,
    completeness: completeness(
      days
        .flatMap((day) => day.activities)
        .filter((item) => item.state === EvaluationState.RANKED).length,
      28,
    ),
    policyVersion: RANKING_POLICY_VERSION,
    forecastSnapshotId: forecast.snapshotId,
    weatherFetchedAt: forecast.weatherFetchedAt,
    marineFetchedAt: forecast.marineFetchedAt,
    freshUntil: forecast.freshUntil,
    computedAt: computedAt.toISOString(),
    days,
  };
}
