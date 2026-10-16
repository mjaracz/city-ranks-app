# Decision trail

These notes connect the implementation to the choices made while building it. They were assembled on 15 October 2026 from the commit history, the working assumptions and the review conversation. They are a retrospective index, rather than an original planning transcript. The scoring constants remain provisional.

## Architecture and storage

The exercise required Node.js, GraphQL and persisted Open-Meteo data. The project adopted a gateway and two domain workers. A modular monolith was considered during the architecture discussion and would have reduced deployment cost. The selected split keeps provider acquisition and freshness in Weather Worker, and activity evaluation in Activity Ranking Worker. Four activities share one worker because they consume the same forecast and produce one daily result.

Separate MongoDB and PostgreSQL instances were introduced to compare write and read performance across different database engines through load tests. MongoDB holds endpoint-shaped cache documents with expiry; Knex/PostgreSQL owns ranking persistence, including transactional result/pointer writes. PostgreSQL JSONB could also hold the weather cache: two database engines are a project and benchmarking choice, not an exercise requirement. The comparison measures the implemented operations and workloads, rather than isolating database-engine performance under identical semantics.

The [load runner](../scripts/load/worker-load.ts), [measurement functions](../scripts/load/load-metrics.ts) and [load-test protocol](load-testing.md) distinguish repository writes from reads through NATS. These measurements do not cover the full GraphQL forecasting and ranking flow.

Evidence: commits `a6676df` and `2577915`; [weather persistence port](../apps/weather-worker/src/weather-api-query-cache.repository.ts), [ranking persistence port](../apps/activity-ranking-worker/src/city-ranking.repository.ts), [Mongo adapter](../apps/weather-worker/src/mongo-weather-api-query-cache.repository.ts), [PostgreSQL adapter](../apps/activity-ranking-worker/src/postgres-city-ranking.repository.ts).

## Business choices

The [business questions](city-ranking-assumptions.md) and matching `BQ-*` comments in code preserve the distinction between the chosen behavior and questions that still need a product decision.

| Decision            | Chosen behavior                                                                                                              | Code to inspect                                                                                                                                                                                                                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BQ-01 and BQ-02     | Today plus six dates in the resolved city's timezone; first geocoding match, with resolved identity returned                 | [ForecastWindowPolicy](../apps/weather-worker/src/domain/forecast-window.policy.ts), [CitySelectionPolicy](../apps/weather-worker/src/domain/city-selection.policy.ts)                                                                                                                                                                 |
| BQ-03               | Rank four activities within each date; round scores before competition ranking, so ties can be 1, 1, 3, 4                    | [rankDay](../apps/activity-ranking-worker/src/domain/daily-ranking.ts), [roundScore](../apps/activity-ranking-worker/src/domain/ranking-score.ts)                                                                                                                                                                                      |
| BQ-04 through BQ-07 | Transparent weather-preference heuristics, rather than a claim about resort, beach or venue availability                     | [Outdoor](../apps/activity-ranking-worker/src/domain/rules/outdoor-sightseeing.rule.ts), [skiing](../apps/activity-ranking-worker/src/domain/rules/skiing.rule.ts), [surfing](../apps/activity-ranking-worker/src/domain/rules/surfing.rule.ts), [indoor](../apps/activity-ranking-worker/src/domain/rules/indoor-sightseeing.rule.ts) |
| BQ-08 and BQ-09     | Persist forecasts for one hour by default; refresh on demand; the ranking command recomputes from the current weather cache  | [OpenMeteoJsonClient](../apps/weather-worker/src/data-providers/open-meteo-json.client.ts), [CityRankingService](../apps/activity-ranking-worker/src/services/city-ranking.service.ts), [ranking command handler](../apps/activity-ranking-worker/src/controllers/activity-ranking-command.handler.ts)                                 |
| BQ-10               | Missing data is distinct from a valid zero and from an explicit scope exclusion                                              | [evaluation model](../libs/models/src/city-ranking.ts), [MarineCoveragePolicy](../apps/weather-worker/src/domain/marine-coverage.policy.ts)                                                                                                                                                                                            |
| BQ-11 and BQ-12     | Keep the currently different command/query length contracts and the exact 24-observation snow rule visible as open questions | [command city validation](../apps/api-gateway/src/dto/domain-command.dto.ts), [query city validation](../libs/contracts/src/city-query.ts), [DailySnowDepthPolicy](../apps/weather-worker/src/domain/daily-snow-depth.policy.ts)                                                                                                       |

The unresolved questions include calibration across different activities, skiing at city altitude versus a resort, the meaning of whole-day maxima, and the exact snow-hour requirement around DST. No product approval or empirical calibration is claimed.

## Implementation sequence

- `a6676df`: gateway, message contracts, workers and durable command infrastructure. This was infrastructure, not a completed ranking service.
- `2577915`: worker-owned persistence, injected ports and load-test tooling.
- `fe09b55`: the city-to-forecast-to-ranking business flow, daily heuristics, missing-data states and immutable results.
- `197f63d` and `e0ce6a6`: runtime DTO validation and its tests. TypeScript interfaces alone do not validate upstream JSON.
- `ea7ae95` and `558808e`: explicit business-policy owners and behavioral tests.
- Current local follow-up: remove the misleading `requestWeatherRefresh` GraphQL mutation and its unused gateway plumbing. Internal NATS weather commands remain separate from the public city-ranking use case. This follow-up is carried on the dedicated feature branch for the refactor.

## AI assistance and verification

AI assisted with architecture analysis, implementation and review. The following is a concrete example from the current review, rather than a claim that generated code was accepted automatically:

1. The review suggested reducing the public refresh API. Inspecting [WeatherCommandHandler](../apps/weather-worker/src/controllers/weather-command.handler.ts) confirmed that city-only commands emitted an event and coordinate-based commands fetched current weather, not the seven-day forecast.
2. The selected follow-up removed the public mutation rather than expanding that extra feature.
3. [Schema tests](../apps/api-gateway/tests/controllers/api-gateway-controller.module.spec.ts) inspect the generated schema and reject both former argument variants. [Gateway integration](../apps/api-gateway/tests/api-gateway.integration-spec.ts) and [city-ranking integration](../apps/api-gateway/tests/city-ranking.integration-spec.ts) verify the remaining path through real NATS and databases, with controlled upstream responses.
4. On 15 October, the follow-up passed 19 gateway unit tests, 8 integration tests, typecheck, all three builds and lint of changed TypeScript files. A preceding review of base commit `2720986` passed 587 unit tests and 14 integration tests, and exercised built applications against live Open-Meteo for three cities. These are distinct validation scopes, not one full rerun after every change.

The same review also exposed a separate failing `test:e2e` configuration and pre-existing lint issues. Those findings remain outside this follow-up; passing the targeted checks does not erase them.

## Deliberate limits

The submission uses explainable heuristics and on-demand refresh. It does not implement resort discovery, beach access, venue schedules, hourly activity windows, scheduled refresh, permanent inbox/outbox processing or automated historical replay. Event retention and immutable ranking records do not by themselves establish event sourcing or exactly-once delivery.

There is a known consistency boundary: the ranking service publishes its computed event before saving the PostgreSQL result. A failed database write can leave an event without its result row. Distributed refresh coordination and bounded history retention are also follow-ups. They should be addressed if the deployment requires them, rather than presented as guarantees of this implementation.

Load tests exercise the documented synthetic workload. They do not show that one database engine is generally faster, nor that an external provider's rate limits or production availability have been tested.
