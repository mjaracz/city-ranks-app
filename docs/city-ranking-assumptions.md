# City ranking business questions and working assumptions

The source is the supplied Senior / Lead Engineer Take-Home Exercise. It requires a city or town, seven days, skiing, surfing, outdoor sightseeing and indoor sightseeing, GraphQL, and persisted Open-Meteo weather. It leaves thresholds, weights, ambiguity and refresh policy open. The earlier project context confirms that each day ranks its four activities independently.

The following choices are working assumptions pending business clarification. `BQ-*` markers identify their implementation locations. The initial policy is `weather-suitability-v1`; changing thresholds, interpretation, rounding or required inputs requires a new version.

| ID    | Question for the business owner                                                                                         | Implemented assumption                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Location                                                                 |
| ----- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| BQ-01 | Does the window start today or tomorrow, and which timezone defines a day? Should today's remaining hours be evaluated? | Today plus six local calendar days in the resolved city's IANA timezone, using whole-day model aggregates. Calendar dates survive DST changes.                                                                                                                                                                                                                                                                                                                                                              | Weather `CityForecastService.getForecast`; `libs/models/src/calendar.ts` |
| BQ-02 | How should ambiguous city names be resolved? Should the client select a location?                                       | Select the first Open-Meteo geocoding match, expose resolved identity, country, region, coordinates and timezone. The input may include a country or region qualifier. Unknown places return `CITY_NOT_FOUND`.                                                                                                                                                                                                                                                                                              | `parseCity`                                                              |
| BQ-03 | What should score values mean, and how should ties be presented?                                                        | A provisional weather-preference scale from 0 to 100, rounded half up to two decimals before comparison. Competition ranking applies within each date: 90, 90, 70, 40 gives 1, 1, 3, 4. Ties are ordered by activity ID for display. No comparison between cities or dates is implied.                                                                                                                                                                                                                      | Domain `rankDay`; `libs/models/src/city-ranking.ts`                      |
| BQ-04 | Which temperatures, rain and wind limits are comfortable, and how should thunderstorms affect suitability?              | Outdoor score = clamp(100 - 3 * abs(mean temperature - 20 C) - 5 * rain mm - 1.5 * max(0, maximum wind km/h - 15)). Thunderstorms set outdoor, skiing and surfing scores to zero. These weights are provisional and need calibration.                                                                                                                                                                                                                                                                       | `outdoorScore`; `evaluateActivities`                                     |
| BQ-05 | Is skiing evaluated at the city, a nearby resort or a particular altitude? Is snow on the ground sufficient?            | City-grid snow depth is a weather proxy, without a facility assertion. Snow multiplier = min(1, daily maximum depth / 0.30 m). Comfort = clamp(100 - 5 * abs(mean temperature + 5 C) - 2 * max(0, maximum wind - 20 km/h) - 2 * max(0, snowfall - 10 cm)). Multiply snow by comfort. Require 24 valid model hourly snow-depth observations for the daily maximum; partial coverage is unknown.                                                                                                              | `parseWeather`; skiing strategy                                          |
| BQ-06 | Which coastal area and skill level define surfing? Is a daily maximum useful, or is an hourly surf window needed?       | An observed marine grid must lie within 50 km of the city. A farther observed grid is explicitly outside this evaluation scope; null marine observations alone remain unknown. Surf score = clamp(100 - abs(maximum wave height - 1.5 m) * 100 / 1.5) * min(1, maximum period / 10 s) * clamp(100 - 3 * max(0, maximum wind - 15 km/h)) / 100. Daily maxima may occur at different hours; this is a coarse heuristic. It assesses neither beach access nor tides, offshore wind direction or local hazards. | `CityForecastService`; surfing strategy                                  |
| BQ-07 | Does indoor suitability mean comfort, venue quality or preference relative to outdoor activity?                         | Weather preference only: 40 + 0.6 * (100 - outdoor score). Indoor activities remain possible in fair weather and become preferred in poor outdoor weather. Opening hours, attractions and travel disruption are outside the model.                                                                                                                                                                                                                                                                          | Indoor strategy                                                          |
| BQ-08 | What freshness and upstream outage policy is acceptable?                                                                | Persist geocoding for seven days and land/marine forecasts for one hour; TTLs are configurable. The first cache miss fills the weather cache and ranking projection synchronously. Fresh persisted ranking queries perform no upstream call. After expiry, refresh on demand. Marine failure returns partial rankings, retained until forecast expiry; land/geocoding failure returns a typed error. No silent stale fallback.                                                                              | `OpenMeteoJsonClient`; `CityRankingService`                              |
| BQ-09 | Should a refresh mutation bypass upstream TTLs, and is a response needed immediately?                                   | The durable ranking refresh command recomputes from the weather worker's current cached forecast. `cityRanking` returns a result synchronously, including on a cold cache. Process-local coalescing reduces concurrent duplicate requests; it is not a distributed refresh lock.                                                                                                                                                                                                                            | `ActivityRankingCommandHandler`; `CityRankingService`                    |
| BQ-10 | Should missing data exclude an activity or show a pessimistic score?                                                    | All four activities remain visible. Missing required observations yield `INSUFFICIENT_DATA`, with null score/rank. Explicit scope exclusion yields `NOT_APPLICABLE`. Zero is a valid ranked poor score. Day/run completeness is independent of freshness.                                                                                                                                                                                                                                                   | Evaluation states and completeness in domain/model                       |

Scores are transparent deterministic heuristics, not validated sport advice or a business-approved calibration. Explanations describe weather inputs rather than asserting that local facilities exist.

## Persistence and reconstruction boundary

MongoDB retains validated upstream responses by endpoint and sorted parameters, excluding API credentials. Forecast cache keys include the explicit local date window, so a midnight rollover cannot serve yesterday's window. PostgreSQL stores each complete seven-day result as one immutable JSONB record, including 28 evaluations and source/policy metadata. A separate lookup pointer is updated in the same transaction and prevents an older weather fetch from displacing a newer result. This model supports nullable scores without coercing unavailable activities into the older numeric activity repository.

JetStream retains the full normalized forecast and computed ranking payloads. Queries read persisted results while fresh. Full automated replay, a permanent message inbox, transactional outbox delivery, distributed refresh coordination and a history-retention policy remain operational follow-ups; this implementation does not claim those guarantees.

## GraphQL contract

`cityRanking(city: String!): CityRanking!` exposes the shared `CityRanking` interface from `libs/models/src/city-ranking.ts` through ApiGateway GraphQL types. UTC processing timestamps are ISO strings; forecast dates are local `YYYY-MM-DD` strings. Errors use GraphQL extension codes `INVALID_CITY`, `CITY_NOT_FOUND`, `UPSTREAM_UNAVAILABLE` and `RANKING_UNAVAILABLE`.

```graphql
query CityRanking($city: String!) {
  cityRanking(city: $city) {
    id
    city {
      id
      name
      country
      countryCode
      region
      latitude
      longitude
      timezone
    }
    windowStartDate
    windowEndDate
    policyVersion
    forecastSnapshotId
    completeness
    weatherFetchedAt
    marineFetchedAt
    freshUntil
    computedAt
    days {
      date
      completeness
      activities {
        activity
        state
        score
        rank
        reasonCodes
        explanation
      }
    }
  }
}
```

Variables: `{ "city": "Gdansk, Poland" }`.
