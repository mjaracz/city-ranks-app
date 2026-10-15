# City Ranks backend

This backend resolves a city or town and returns seven daily rankings of skiing, surfing, outdoor sightseeing and indoor sightseeing through GraphQL. Each date ranks its four activities independently. Weather is obtained from Open-Meteo and persisted rather than fetched on every request.

The framework-independent `CityRanking` interface and its nested models live in [`libs/models`](libs/models/src/city-ranking.ts). The initial scoring policy is `weather-suitability-v1`. Business questions, formulas and working assumptions are documented in [city ranking assumptions](docs/city-ranking-assumptions.md); matching implementation locations carry `BQ-01` through `BQ-10` markers. The provisional thresholds need business calibration.

The [decision trail](docs/decision-trail.md) connects architecture and scope choices to commits, business-rule locations and the checks used during AI-assisted work.

## Run locally

Prerequisites: Node.js 20.19+ in the 20.x line or 22.12+, pnpm, and Docker Compose v2 with the Docker daemon running.

Run the script for your operating system from the repository root. It creates `.env` from `.env.example` only when `.env` does not exist, installs locked dependencies, starts NATS JetStream, MongoDB and PostgreSQL with Docker Compose and waits on the configured database health checks, applies PostgreSQL migrations, then starts each NestJS service in its own detached process.

| Operating system | Command |
| --- | --- |
| Linux | `sh ./scripts/start-linux.sh` |
| macOS | `sh ./scripts/start-macos.sh` |
| Windows PowerShell | `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1` |

The first run may take a few minutes while dependencies and Docker images are downloaded. Setup output and service logs are saved under `.codex/logs/`; process IDs are saved under `.codex/run/`. Once the gateway and workers report successful startup in their logs, open `http://localhost:3000/graphql`.

To stop all three application processes and the Compose services, run `node scripts/local-environment.mjs stop` from the repository root. Compose volumes are preserved, so database contents remain available on the next start. To apply migrations again after changing the schema, run `pnpm run db:migrate:activity-ranking` with the Compose databases running.

The default Compose project name is `city-ranks-local`. Set `CITY_RANKS_COMPOSE_PROJECT_NAME` to a unique lowercase name before starting if you need to run multiple local copies side by side.

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

ApiGateway is the only HTTP application. GraphQL queries call the activity-ranking worker over NATS, and that worker requests forecasts from the weather worker over NATS. Domain workers expose message handlers only, organized under `controllers`. GraphQL resolvers, schema types, configuration and error mapping live in `apps/api-gateway/src/controllers`; application services stay in `services`. Worker database adapters and migrations live in `infrastructure`, decorated payloads in `dto`, and validation helpers and custom constraints in `utils`. Each owns its database and receives its repository through a port; there is no cross-service database access.

The weather worker persists validated geocoding responses, daily land forecasts, hourly snow depth and marine forecasts in MongoDB. Defaults are seven days for geocoding and one hour for forecasts, configurable with `GEOCODING_CACHE_TTL_MS` and `CITY_FORECAST_CACHE_TTL_MS`. Cache keys include the explicit local date window and exclude API credentials. The existing current-weather provider retains its separate 15-minute default. MongoDB TTL indexes remove expired entries; fresh reads also enforce the deadline directly.

Only the weather worker calls Open-Meteo. Response DTOs use class-transformer and class-validator on both live responses and cache reads before mapping them to the shared CityForecast model. Implicit type conversion is disabled: null measurements remain missing, while strings in numeric fields are rejected. Freshness and the seven city-local forecast dates are checked before publishing forecast-snapshot-accepted. The ranking worker requests the validated forecast through NATS request/reply.

The ranking worker stores a full seven-day result, including all 28 evaluations and policy/source metadata, as an immutable JSONB record in PostgreSQL. A query pointer is updated in the same transaction and prevents an older weather fetch from replacing a newer result. A fresh pointer returns the persisted ranking without an upstream call. Cache misses fill the forecast and ranking synchronously. Missing or failed marine data can yield partial rankings; geocoding or land-provider failure returns an error. There is no silent stale fallback.

Before opening a write transaction, the ranking worker validates result DTOs with class-transformer and class-validator. Custom constraints preserve competition ranks, daily and overall completeness, and the consecutive seven-day window. Historical results are checked against their stored date window.

JetStream retains full `forecast-snapshot-accepted` and `city-ranking-computed` payloads. Durable `DOMAIN_COMMANDS` consumers use explicit acknowledgements and bounded retries. Ranking refresh commands recompute from the weather worker's cached forecast. Legacy weather commands remain internal NATS operations: coordinate-based commands fetch current conditions, and city-only commands emit the scaffold request event. The existing numeric activity repository/query remain available for their repository and load-test use cases.

Worker replicas share their domain's database, queue group and durable consumer. Concurrent misses are coalesced within a worker process. Full automatic event replay, permanent inbox/outbox handling, distributed refresh coordination, scheduled refresh and history retention remain operational follow-ups; the current adapters do not establish those guarantees.

See [repository design](docs/repositories.md), [repeatable worker load tests](docs/load-testing.md), and the concise [decision trail](docs/decision-trail.md).

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
```

The public API exposes `cityRanking`, `workersHealth` and `requestActivityRanking`. City forecasts refresh on demand when their persisted data expires; the ranking mutation recomputes using the weather worker's current cache.

## Verification

- `pnpm build` builds ApiGateway and both workers.
- `pnpm typecheck` checks application, model and test types.
- `pnpm test --runInBand` covers scoring, ties, missing data, local dates, provider validation and weather-cache reuse.
- `pnpm test:integration` exercises worker commands, repositories and city-ranking GraphQL against real NATS JetStream, MongoDB and PostgreSQL, with controlled upstream responses for the new business flow. It verifies persisted results across worker restarts, cache hits without provider requests, immutable history and older-source protection.
- `pnpm test:repositories` runs the existing repository/provider tests.

## Weather API references

Request variables and geocoding behavior follow the [Open-Meteo forecast API](https://open-meteo.com/en/docs), [geocoding API](https://open-meteo.com/en/docs/geocoding-api) and [marine API](https://open-meteo.com/en/docs/marine-weather-api).
