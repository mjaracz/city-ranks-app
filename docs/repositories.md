# Worker persistence

Each worker owns its database and exposes a domain-specific repository port. Consumers and query handlers depend on the port. Database drivers, indexes, migration APIs and row/document mapping live in infrastructure adapters. Workers expose NATS message handlers; public HTTP remains in ApiGateway.

## Activity ranking: PostgreSQL and Knex

`ActivityRankingPersistenceModule` binds `ActivityRankingRepository` to `PostgresActivityRankingRepository`. `ActivityRankingDatabaseModule` creates one Knex client under the `ACTIVITY_RANKING_KNEX` token. Its pool is shared with readiness checks, uses `min: 0`, and defaults to ten connections. Shutdown destroys the pool. Tests can replace the token without opening a connection.

The repository offers `saveRankings` and `findByCityAndPeriod`, rather than exposing a general SQL or CRUD interface. It validates input at runtime, allows up to 1,000 records per write, and limits reads to 31 days with an exclusive end date. City names are exact string values. Scores must be finite and within 0–100; dates use valid `YYYY-MM-DD` values.

Writes use a bulk Knex insert and `onConflict(...).merge(...)`. A transaction covers every chunk, so a later chunk failure rolls back the whole call. Repeated domain keys within one batch retain the last supplied value. Keys are sorted consistently before insertion. The primary key is `(city, activity, forecast_date)`; a `(city, forecast_date)` index supports range reads. PostgreSQL enforces activity and score constraints in addition to application validation.

The schema is maintained by a versioned Knex migration with native migration locking. Run `pnpm db:migrate:activity-ranking` before starting the worker. Repositories do not create tables. The infrastructure module checks schema readiness and closes its pool if initialization fails. Existing installations that created `activity_rankings` using an earlier prototype need a deliberate baseline migration before adopting the migration history; the migration does not silently adopt an unknown schema.

SQL injection is prevented by binding values through Knex `insert` and `where`, with fixed table, column, ordering and conflict identifiers. The only `raw` expression casts the fixed `forecast_date` identifier to text so date serialization is independent of the process timezone. It uses identifier bindings and contains no user input. SQL-looking city names are stored literally; they are not stripped or interpolated. Tests check real Knex-generated SQL and bindings, rollback behavior and replacement through DI. The real-database integration suite additionally verifies literal storage and an intact table. See [Knex parameter binding](https://knexjs.org/guide/raw.html#raw-parameter-binding) and [migrations](https://knexjs.org/guide/migrations.html).

## Weather: MongoDB

`WeatherPersistenceModule` binds `WeatherApiQueryCacheRepository` to `MongoWeatherApiQueryCacheRepository`. The infrastructure module creates one `MongoClient`, an explicit database and a typed collection. The repository receives the collection through `WEATHER_API_CACHE_COLLECTION`; it does not construct or close a client. Startup connects and ensures indexes, and shutdown closes the client. Readiness uses the same client.

Each cached Open-Meteo response is one document in `weather_api_query_cache`. Its `_id` is a SHA-256 signature of the endpoint and sorted query parameters. API keys are excluded from the signature and stored metadata. `replaceOne(..., { upsert: true })` atomically replaces one entry. Writes use `{ w: 1, j: true }` for acknowledgement after journaling on the local standalone database. The client pool defaults to ten connections.

The `expiresAt` TTL index removes expired documents. A fresh read also checks `expiresAt > now`, because [MongoDB TTL cleanup is asynchronous](https://www.mongodb.com/docs/manual/core/index-ttl/). The repository accepts a validated signature string and constructs its own filter, so an object such as `{ "$ne": null }` cannot become a query operator. Arbitrary request objects are never merged into database filters.

The provider caches only successful, validated responses and coalesces simultaneous misses within one worker process. Cache entries are shared by replicas; coalescing is local to a process. `WEATHER_API_CACHE_ONLY=true` rejects misses before any upstream request, which makes load runs independent of Open-Meteo availability and rate limits.

## Commands and queries

Public GraphQL exposes `cityRanking`, `workersHealth` and `requestActivityRanking`. Weather refresh commands are internal NATS operations: commands containing coordinates fetch through the cached provider and append `current-weather-fetched` to JetStream, while city-only commands preserve the scaffold event. `weather.current-weather.query.v1` reads current conditions through the same provider. `activity-ranking.rankings.query.v1` reads the ranking repository. The ranking refresh consumer recomputes the seven-day city ranking. `ranking.city.get.v1` returns a complete city result through `CityRankingRepository`; this port persists full immutable JSONB results and freshness-aware query pointers in separate versioned tables. The older `activity-ranking.rankings.query.v1` and numeric activity repository remain compatible for existing repository/load use cases. See [city ranking assumptions](city-ranking-assumptions.md).

The cache migration does not move old PostgreSQL weather cache entries. Compose uses a new MongoDB volume, and existing PostgreSQL volumes are not deleted. Copy the current MongoDB settings from `.env.example` into the local `.env`.
