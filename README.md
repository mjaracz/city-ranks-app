# City Ranks backend

This backend resolves a city or town and returns seven daily rankings of skiing, surfing, outdoor sightseeing and indoor sightseeing through GraphQL. Each date ranks its four activities independently. Weather is obtained from Open-Meteo and persisted rather than fetched on every request.

The framework-independent `CityRanking` interface and its nested models live in [`libs/models`](libs/models/src/city-ranking.ts). The initial scoring policy is `weather-suitability-v1`. Business questions, formulas and working assumptions are documented in [city ranking assumptions](docs/city-ranking-assumptions.md); matching implementation locations carry `BQ-01` through `BQ-10` markers. The provisional thresholds need business calibration.

## Run locally

Use Node.js 20.19+ in the 20.x line or 22.12+.

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env`; its credentials are for local development.
3. Start NATS JetStream, MongoDB and PostgreSQL with `docker compose up -d --wait`.
4. Run `pnpm db:migrate:activity-ranking`, including after updating an existing installation.
5. Start `pnpm start:dev:weather-worker`, `pnpm start:dev:activity-ranking-worker` and `pnpm start:dev:api-gateway` in separate terminals.
6. Open `http://localhost:3000/graphql`.

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

Results include today and the following six local calendar dates. Scores use a provisional 0-100 weather-preference scale, rounded before competition ranking: tied scores share a rank. Every day contains all four activities. Missing required inputs give `INSUFFICIENT_DATA` with null score/rank; explicit scope exclusions give `NOT_APPLICABLE`. Zero remains a ranked poor score. Explanations assess weather without asserting facility availability.

Ambiguous names use the first Open-Meteo match; the returned country, region, coordinates and timezone identify it. A country or region qualifier can narrow the search. GraphQL errors have codes `INVALID_CITY`, `CITY_NOT_FOUND`, `UPSTREAM_UNAVAILABLE` or `RANKING_UNAVAILABLE`.

## Architecture and persistence

ApiGateway is the only HTTP application. GraphQL queries call the activity-ranking worker over NATS, and that worker requests forecasts from the weather worker over NATS. Domain workers expose message handlers only. Each owns its database and receives its repository through a port; there is no cross-service database access.

The weather worker persists validated geocoding responses, daily land forecasts, hourly snow depth and marine forecasts in MongoDB. Defaults are seven days for geocoding and one hour for forecasts, configurable with `GEOCODING_CACHE_TTL_MS` and `CITY_FORECAST_CACHE_TTL_MS`. Cache keys include the explicit local date window and exclude API credentials. The existing current-weather provider retains its separate 15-minute default. MongoDB TTL indexes remove expired entries; fresh reads also enforce the deadline directly.

The ranking worker stores a full seven-day result, including all 28 evaluations and policy/source metadata, as an immutable JSONB record in PostgreSQL. A query pointer is updated in the same transaction and prevents an older weather fetch from replacing a newer result. A fresh pointer returns the persisted ranking without an upstream call. Cache misses fill the forecast and ranking synchronously. Missing or failed marine data can yield partial rankings; geocoding or land-provider failure returns an error. There is no silent stale fallback.

JetStream retains full `forecast-snapshot-accepted` and `city-ranking-computed` payloads. Durable `DOMAIN_COMMANDS` consumers use explicit acknowledgements and bounded retries. Ranking refresh commands now recompute from the weather worker's cached forecast. Existing coordinate-based weather refresh commands fetch current conditions; city-only weather refresh commands retain the scaffold request event. The existing numeric activity repository/query remain available for their repository and load-test use cases.

Worker replicas share their domain's database, queue group and durable consumer. Concurrent misses are coalesced within a worker process. Full automatic event replay, permanent inbox/outbox handling, distributed refresh coordination, scheduled refresh and history retention remain operational follow-ups; the current adapters do not establish those guarantees.

See [repository design](docs/repositories.md) and [repeatable worker load tests](docs/load-testing.md).

## Other GraphQL operations

```graphql
query {
  workersHealth {
    service
    ready
    database
    eventStore
    commandConsumer
  }
}

mutation {
  requestActivityRanking(city: "Gdansk, Poland") {
    commandId
    domain
    accepted
  }
}

mutation {
  requestWeatherRefresh(
    city: "Reykjavik"
    latitude: 64.1466
    longitude: -21.9426
  ) {
    commandId
    domain
    accepted
  }
}
```

## Verification

- `pnpm build` builds ApiGateway and both workers.
- `pnpm typecheck` checks application, model and test types.
- `pnpm test --runInBand` covers scoring, ties, missing data, local dates, provider validation and weather-cache reuse.
- `pnpm test:integration` exercises worker commands, repositories and city-ranking GraphQL against real NATS JetStream, MongoDB and PostgreSQL, with controlled upstream responses for the new business flow. It verifies persisted results across worker restarts, cache hits without provider requests, immutable history and older-source protection.
- `pnpm test:repositories` runs the existing repository/provider tests.

## Weather API references

Request variables and geocoding behavior follow the [Open-Meteo forecast API](https://open-meteo.com/en/docs), [geocoding API](https://open-meteo.com/en/docs/geocoding-api) and [marine API](https://open-meteo.com/en/docs/marine-weather-api).
