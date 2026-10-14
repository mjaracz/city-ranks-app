# City Ranks backend

This repository is the backend foundation for ranking the next seven days in a city for skiing, surfing, outdoor sightseeing, and indoor sightseeing. It contains a GraphQL API Gateway and two domain workers. Forecast retrieval, persistence, read models, and activity scoring remain the next business slice.

## Architecture

- `api-gateway` is the only public HTTP application. GraphQL is served at `/graphql`. It uses Core NATS request/reply for worker health and JetStream for durable domain commands.
- `weather-worker` owns weather data and its MongoDB database. `activity-ranking-worker` owns ranking data in PostgreSQL through Knex. Each is a message-only worker with no HTTP listener.
- Domain commands are stored in the file-backed `DOMAIN_COMMANDS` work queue. Durable consumers named per domain are shared by replicas. A worker acknowledges a command only after appending its event.
- Each domain owns a separate persistent JetStream event stream (`WEATHER_EVENTS` or `ACTIVITY_RANKING_EVENTS`). Those streams use limits retention without configured age, message-count, or byte limits; the command queue and event history have separate retention semantics.
- Event IDs are derived from command IDs so JetStream can deduplicate retried appends within its duplicate window. Consumers use explicit acknowledgements and bounded redelivery. A durable database inbox/outbox and projection transaction will be needed for end-to-end idempotency across longer replay windows.
- Each domain service owns one database shared by its replicas. The Compose stack has MongoDB for weather and PostgreSQL for ranking. Repository ports keep persistence details out of worker consumers. The NATS queue groups for health handlers and shared durable consumers allow horizontal replicas without adding public worker endpoints.
- Weather refresh commands can include coordinates. The weather worker fetches current conditions from Open-Meteo and publishes a `current-weather-fetched` event; calls with only a city still publish `forecast-refresh-requested`. Successful Open-Meteo responses are cached in MongoDB. The ranking worker currently appends its refresh-requested event; ranking projections and scoring remain the next vertical slice.

For the take-home on its own, a modular monolith would be smaller and easier to operate. The current service boundaries follow the requested architecture and keep data ownership explicit without creating a separate service for every activity.

## Run locally

Use Node.js 20.19 or later in the 20.x line, or 22.12 or later. Nest 12 and Apollo Server 5 require a supported Node.js runtime.

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env`. Its database credentials are for local development only.
3. Start NATS JetStream, MongoDB and PostgreSQL with `docker compose up -d --wait`.
4. Run `pnpm db:migrate:activity-ranking`.
5. Start `pnpm start:dev:weather-worker`, `pnpm start:dev:activity-ranking-worker`, and `pnpm start:dev:api-gateway` in separate terminals.
6. Open `http://localhost:3000/graphql` and query worker readiness:

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
```

The gateway accepts durable command requests:

```graphql
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

mutation {
  requestActivityRanking(city: "Reykjavik") {
    commandId
    domain
    accepted
  }
}
```

Build all deployable applications with `pnpm build`.

The MongoDB `weather_api_query_cache` collection stores validated Open-Meteo responses with a TTL index and explicit freshness checks. `WEATHER_API_CACHE_TTL_MS` defaults to 15 minutes. The PostgreSQL `activity_rankings` table uses transactional bulk upserts and parameterized Knex queries. Connections are injected through infrastructure tokens. See [repository design and injection protection](docs/repositories.md) and [repeatable worker load tests](docs/load-testing.md).

## Integration tests

Start the Docker dependencies first. The integration setup reads `.env` when present and otherwise uses the local Compose connection defaults.

- `pnpm test:integration:weather` verifies weather worker health, durable command consumption, and persisted event contents.
- `pnpm test:integration:activity-ranking` verifies ranking worker health, durable command consumption, and persisted event contents.
- `pnpm test:integration:gateway` starts both workers and the API Gateway, calls GraphQL health and command mutations, then reads the events back from JetStream.
- `pnpm test:integration` runs all three suites.

## Next vertical slice

Persist forecast location and freshness metadata in the weather database, expand the Open-Meteo query to daily forecasts, and publish complete versioned weather events. The activity-ranking worker should consume those events into its own projection and compute the four activity scores without reading the weather database. Event payloads should contain enough information to rebuild projections without rereading Open-Meteo. Add a database-backed inbox/outbox, idempotent command handling, and stale-update coordination before running concurrent refresh workers in production.
