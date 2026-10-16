# City Ranks project overview

City Ranks resolves a city or town and returns seven daily rankings of skiing, surfing, outdoor sightseeing and indoor sightseeing through GraphQL. Each date ranks its four activities independently. Weather data comes from Open-Meteo and is persisted rather than fetched on every request.

The framework-independent `CityRanking` interface and its nested models live in [`libs/models`](../libs/models/src/city-ranking.ts). The initial scoring policy is `weather-suitability-v1`. Business questions, formulas and working assumptions are documented in [city ranking assumptions](city-ranking-assumptions.md); related implementation locations carry `BQ-*` markers. The thresholds remain provisional and need business calibration.

## Product behavior

### City selection and forecast window

The result covers today and the following six dates in the resolved city's timezone. Ambiguous names use the first Open-Meteo geocoding match; the response includes the resolved country, region, coordinates and timezone. A country or region qualifier can narrow the search.

### Daily activity ranking

Each day contains all four activities. Scores use a provisional 0–100 weather-suitability scale and are rounded before competition ranking, so tied activities share a rank. A valid score of zero remains a poor but ranked result. Missing required inputs produce `INSUFFICIENT_DATA` with null score and rank; explicit scope exclusions produce `NOT_APPLICABLE`. Explanations describe weather conditions and do not claim resort, beach or venue availability.

### GraphQL API

The public API exposes `cityRanking`, `workersHealth` and `requestActivityRanking`. A city-ranking query can request the resolved identity, date window, freshness and per-activity evaluations:

```graphql
query CityRanking($city: String!) {
  cityRanking(city: $city) {
    city {
      id
      name
      countryCode
      region
      timezone
    }
    windowStartDate
    windowEndDate
    policyVersion
    completeness
    weatherFetchedAt
    marineFetchedAt
    freshUntil
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

City forecasts refresh on demand when persisted data expires. The ranking command recomputes from the weather worker's current cache. GraphQL errors use `INVALID_CITY`, `CITY_NOT_FOUND`, `UPSTREAM_UNAVAILABLE` or `RANKING_UNAVAILABLE`.

## Architecture and persistence

ApiGateway is the only HTTP application. GraphQL queries call the activity-ranking worker over NATS, which requests forecasts from the weather worker over NATS. Domain workers handle messages only. GraphQL resolvers, schema types, configuration and error mapping live in `apps/api-gateway/src/controllers`; application services live in `services`. Worker database adapters and migrations live in `infrastructure`, decorated payloads in `dto`, and validation helpers and custom constraints in `utils`. Each worker owns its database and accesses it through repository ports; there is no cross-service database access.

Only the weather worker calls Open-Meteo. It persists validated geocoding responses, daily land forecasts, hourly snow depth and marine forecasts in MongoDB. Geocoding defaults to a seven-day cache and forecasts to a one-hour cache, configurable with `GEOCODING_CACHE_TTL_MS` and `CITY_FORECAST_CACHE_TTL_MS`. Cache keys include the explicit local date window and exclude API credentials. The existing current-weather provider has a separate 15-minute default. MongoDB TTL indexes remove expired entries, and reads also check the deadline directly.

Open-Meteo responses and cached values are validated with class-transformer and class-validator before mapping to the shared `CityForecast` model. Implicit conversion is disabled: null measurements remain missing, while strings in numeric fields are rejected. Freshness and the seven city-local forecast dates are checked before the weather worker publishes `forecast-snapshot-accepted`.

The ranking worker stores a full seven-day result, including all 28 evaluations and policy/source metadata, as an immutable JSONB record in PostgreSQL. A query pointer is updated in the same transaction and prevents an older weather fetch from replacing a newer result. A fresh pointer returns the persisted ranking without an upstream call; a cache miss fills the forecast and ranking synchronously. Missing or failed marine data can produce partial rankings, while geocoding or land-provider failure returns an error. There is no silent stale fallback.

Before opening a write transaction, the ranking worker validates result DTOs. Custom constraints preserve competition ranks, daily and overall completeness, and the consecutive seven-day window. Historical results are checked against their stored date window.

## Messaging and operational boundaries

JetStream retains full `forecast-snapshot-accepted` and `city-ranking-computed` payloads. Durable `DOMAIN_COMMANDS` consumers use explicit acknowledgements and bounded retries. Ranking refresh commands recompute from the weather worker's cached forecast. Legacy weather commands remain internal NATS operations: coordinate-based commands fetch current conditions, and city-only commands emit the scaffold request event. The existing numeric activity repository/query remain available for repository and load-test use cases.

Worker replicas share their domain's database, queue group and durable consumer. Concurrent misses are coalesced within a worker process. Full automatic event replay, permanent inbox/outbox handling, distributed refresh coordination, scheduled refresh and history retention remain operational follow-ups; the current adapters do not establish those guarantees.

## Related documentation

- [Business assumptions and open questions](city-ranking-assumptions.md)
- [Decision trail](decision-trail.md)
- [Repository design](repositories.md)
- [Worker load-test protocol](load-testing.md)

## Verification

- `pnpm build` builds ApiGateway and both workers.
- `pnpm typecheck` checks application, model and test types.
- `pnpm test --runInBand` covers scoring, ties, missing data, local dates, provider validation and weather-cache reuse.
- `pnpm test:integration` exercises worker commands, repositories and city-ranking GraphQL against NATS JetStream, MongoDB and PostgreSQL, with controlled upstream responses for the city-ranking flow.
- `pnpm test:repositories` runs the existing repository and provider tests.

## Open-Meteo references

Request variables and geocoding behavior follow the [forecast API](https://open-meteo.com/en/docs), [geocoding API](https://open-meteo.com/en/docs/geocoding-api) and [marine API](https://open-meteo.com/en/docs/marine-weather-api).
