# SOLID class review

Reviewed 116 current source classes across apps, libs and scripts, plus two retired Hello World classes. Test doubles are excluded. The inventory records responsibility and dependency boundaries; it does not claim formal verification of every SOLID property.

## Implemented separation

- Application services orchestrate injected domain policies, factories and infrastructure ports.
- Forecast window, first-city choice, marine scope, snow coverage, snapshot identity and ranking freshness have explicit owners.
- Dedicated class-validator/class-transformer DTOs declare command, coordinate and cache invariants. Implicit conversion is disabled.
- Modules construct JetStream consumers; handlers depend on an injected consumer interface.
- GraphQL registration is owned by one controller module. The previously unregistered Hello World controller/service and obsolete test were removed.
- Transactions, SQL revision ordering, Mongo expiry filters, HTTP access and acknowledgement/retry protocols remain in their infrastructure adapters.

## Preserved business rules and open questions

- Four activities are ranked independently within each of seven city-local dates. Competition ties, half-up rounding and distinct missing/non-applicable outcomes are retained.
- Snapshot freshness uses the earliest available source expiration. Mongo TTL cleanup retains explicit freshness filtering.
- BQ-01 through BQ-10 remain provisional assumptions in their domain owners.
- BQ-11: Commands accept 1-120 city characters while ranking queries require 2-120. Confirm whether these contracts should converge; both are preserved.
- BQ-12: Snow depth requires 24 model hours. Confirm whether DST days should require 23/25 local hours; the existing rule is preserved.

## Inventory

| Class | Source | Responsibility | Decision |
| --- | --- | --- | --- |
| ActivityRankingWorkerModule | [apps/activity-ranking-worker/src/activity-ranking-worker.module.ts:18](../../apps/activity-ranking-worker/src/activity-ranking-worker.module.ts) | Dependency composition | Provider binding only |
| ActivityRankingRepository | [apps/activity-ranking-worker/src/activity-ranking.repository.ts:16](../../apps/activity-ranking-worker/src/activity-ranking.repository.ts) | Abstract persistence port | Interface for injection |
| CityRankingRepository | [apps/activity-ranking-worker/src/city-ranking.repository.ts:3](../../apps/activity-ranking-worker/src/city-ranking.repository.ts) | Abstract persistence port | Interface for injection |
| ActivityRankingCommandHandler | [apps/activity-ranking-worker/src/controllers/activity-ranking-command.handler.ts:19](../../apps/activity-ranking-worker/src/controllers/activity-ranking-command.handler.ts) | Ranking command orchestration; receives an injected consumer port | Extracted or composed through DI |
| ActivityRankingHealthHandler | [apps/activity-ranking-worker/src/controllers/activity-ranking-health.handler.ts:9](../../apps/activity-ranking-worker/src/controllers/activity-ranking-health.handler.ts) | Aggregate infrastructure readiness, without activity rules | Retained cohesive responsibility |
| ActivityRankingQueryHandler | [apps/activity-ranking-worker/src/controllers/activity-ranking-query.handler.ts:10](../../apps/activity-ranking-worker/src/controllers/activity-ranking-query.handler.ts) | RPC input mapping; DTO query validation before repository access | Extracted or composed through DI |
| CityRankingQueryHandler | [apps/activity-ranking-worker/src/controllers/city-ranking-query.handler.ts:12](../../apps/activity-ranking-worker/src/controllers/city-ranking-query.handler.ts) | RPC request/result and error mapping; delegates domain execution | Retained cohesive responsibility |
| RankingFreshnessPolicy | [apps/activity-ranking-worker/src/domain/ranking-freshness.policy.ts:4](../../apps/activity-ranking-worker/src/domain/ranking-freshness.policy.ts) | Single city-local current-window rule | Extracted or composed through DI |
| RankingPolicyModule | [apps/activity-ranking-worker/src/domain/ranking-policy.module.ts:13](../../apps/activity-ranking-worker/src/domain/ranking-policy.module.ts) | Dependency composition | Provider binding only |
| RankingPolicy | [apps/activity-ranking-worker/src/domain/ranking-policy.ts:22](../../apps/activity-ranking-worker/src/domain/ranking-policy.ts) | Ranking orchestration; receives per-activity rule interface collection | Extracted or composed through DI |
| IndoorSightseeingRule | [apps/activity-ranking-worker/src/domain/rules/indoor-sightseeing.rule.ts:10](../../apps/activity-ranking-worker/src/domain/rules/indoor-sightseeing.rule.ts) | One activity suitability strategy | Injectable rule with explicit call context |
| OutdoorSightseeingRule | [apps/activity-ranking-worker/src/domain/rules/outdoor-sightseeing.rule.ts:15](../../apps/activity-ranking-worker/src/domain/rules/outdoor-sightseeing.rule.ts) | One activity suitability strategy | Injectable rule with explicit call context |
| SkiingRule | [apps/activity-ranking-worker/src/domain/rules/skiing.rule.ts:15](../../apps/activity-ranking-worker/src/domain/rules/skiing.rule.ts) | One activity suitability strategy | Injectable rule with explicit call context |
| SurfingRule | [apps/activity-ranking-worker/src/domain/rules/surfing.rule.ts:16](../../apps/activity-ranking-worker/src/domain/rules/surfing.rule.ts) | One activity suitability strategy | Injectable rule with explicit call context |
| ActivityRankingCityDto | [apps/activity-ranking-worker/src/dto/activity-ranking.dto.ts:35](../../apps/activity-ranking-worker/src/dto/activity-ranking.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| ActivityRankingPeriodDto | [apps/activity-ranking-worker/src/dto/activity-ranking.dto.ts:43](../../apps/activity-ranking-worker/src/dto/activity-ranking.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| ActivityRankingDto | [apps/activity-ranking-worker/src/dto/activity-ranking.dto.ts:58](../../apps/activity-ranking-worker/src/dto/activity-ranking.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| ActivityRankingBatchDto | [apps/activity-ranking-worker/src/dto/activity-ranking.dto.ts:95](../../apps/activity-ranking-worker/src/dto/activity-ranking.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| RankingCityLocationDto | [apps/activity-ranking-worker/src/dto/city-ranking.dto.ts:37](../../apps/activity-ranking-worker/src/dto/city-ranking.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| ActivityEvaluationDto | [apps/activity-ranking-worker/src/dto/city-ranking.dto.ts:81](../../apps/activity-ranking-worker/src/dto/city-ranking.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| DailyCityRankingDto | [apps/activity-ranking-worker/src/dto/city-ranking.dto.ts:117](../../apps/activity-ranking-worker/src/dto/city-ranking.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| CityRankingDto | [apps/activity-ranking-worker/src/dto/city-ranking.dto.ts:139](../../apps/activity-ranking-worker/src/dto/city-ranking.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| WeatherRankingConditionsDto | [apps/activity-ranking-worker/src/dto/ranking-conditions.dto.ts:5](../../apps/activity-ranking-worker/src/dto/ranking-conditions.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| TemperatureRankingConditionsDto | [apps/activity-ranking-worker/src/dto/ranking-conditions.dto.ts:15](../../apps/activity-ranking-worker/src/dto/ranking-conditions.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| OutdoorRankingConditionsDto | [apps/activity-ranking-worker/src/dto/ranking-conditions.dto.ts:25](../../apps/activity-ranking-worker/src/dto/ranking-conditions.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| SkiingRankingConditionsDto | [apps/activity-ranking-worker/src/dto/ranking-conditions.dto.ts:31](../../apps/activity-ranking-worker/src/dto/ranking-conditions.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| SurfingRankingConditionsDto | [apps/activity-ranking-worker/src/dto/ranking-conditions.dto.ts:41](../../apps/activity-ranking-worker/src/dto/ranking-conditions.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| PolicyActivityEvaluationDto | [apps/activity-ranking-worker/src/dto/ranking-policy.dto.ts:17](../../apps/activity-ranking-worker/src/dto/ranking-policy.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| RankedPolicyEvaluationDto | [apps/activity-ranking-worker/src/dto/ranking-policy.dto.ts:27](../../apps/activity-ranking-worker/src/dto/ranking-policy.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| UnavailablePolicyEvaluationDto | [apps/activity-ranking-worker/src/dto/ranking-policy.dto.ts:35](../../apps/activity-ranking-worker/src/dto/ranking-policy.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| DailyRankingInputDto | [apps/activity-ranking-worker/src/dto/ranking-policy.dto.ts:45](../../apps/activity-ranking-worker/src/dto/ranking-policy.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| ForecastRankingInputDto | [apps/activity-ranking-worker/src/dto/ranking-policy.dto.ts:72](../../apps/activity-ranking-worker/src/dto/ranking-policy.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| ActivityRankingDatabaseLifecycle | [apps/activity-ranking-worker/src/infrastructure/activity-ranking-database.module.ts:14](../../apps/activity-ranking-worker/src/infrastructure/activity-ranking-database.module.ts) | Schema readiness and connection cleanup lifecycle | Retained cohesive responsibility |
| ActivityRankingDatabaseModule | [apps/activity-ranking-worker/src/infrastructure/activity-ranking-database.module.ts:42](../../apps/activity-ranking-worker/src/infrastructure/activity-ranking-database.module.ts) | Dependency composition | Provider binding only |
| ActivityRankingPersistenceModule | [apps/activity-ranking-worker/src/infrastructure/activity-ranking-persistence.module.ts:8](../../apps/activity-ranking-worker/src/infrastructure/activity-ranking-persistence.module.ts) | Dependency composition | Provider binding only |
| PostgresActivityRankingRepository | [apps/activity-ranking-worker/src/postgres-activity-ranking.repository.ts:25](../../apps/activity-ranking-worker/src/postgres-activity-ranking.repository.ts) | Validated transactional upserts and batching; storage mechanics remain in adapter | Retained cohesive responsibility |
| PostgresCityRankingRepository | [apps/activity-ranking-worker/src/postgres-city-ranking.repository.ts:8](../../apps/activity-ranking-worker/src/postgres-city-ranking.repository.ts) | Immutable results, monotonic projection pointers and SQL freshness; validation already separated | Retained cohesive responsibility |
| ActivityRankingDatabaseHealth | [apps/activity-ranking-worker/src/services/activity-ranking-database-health.service.ts:5](../../apps/activity-ranking-worker/src/services/activity-ranking-database-health.service.ts) | Ranking storage availability probe | Retained cohesive responsibility |
| CityRankingService | [apps/activity-ranking-worker/src/services/city-ranking.service.ts:19](../../apps/activity-ranking-worker/src/services/city-ranking.service.ts) | Ranking orchestration; scoring and local-date freshness policies injected | Extracted or composed through DI |
| RankingPeriodLength | [apps/activity-ranking-worker/src/utils/activity-ranking.constraints.ts:12](../../apps/activity-ranking-worker/src/utils/activity-ranking.constraints.ts) | One cross-field validation invariant | Validation rule only; no I/O |
| ScalarActivityFactors | [apps/activity-ranking-worker/src/utils/activity-ranking.constraints.ts:33](../../apps/activity-ranking-worker/src/utils/activity-ranking.constraints.ts) | One cross-field validation invariant | Validation rule only; no I/O |
| DailyRankingConsistency | [apps/activity-ranking-worker/src/utils/ranking.constraints.ts:16](../../apps/activity-ranking-worker/src/utils/ranking.constraints.ts) | One cross-field validation invariant | Validation rule only; no I/O |
| RankingWindow | [apps/activity-ranking-worker/src/utils/ranking.constraints.ts:43](../../apps/activity-ranking-worker/src/utils/ranking.constraints.ts) | One cross-field validation invariant | Validation rule only; no I/O |
| RankingCompleteness | [apps/activity-ranking-worker/src/utils/ranking.constraints.ts:61](../../apps/activity-ranking-worker/src/utils/ranking.constraints.ts) | One cross-field validation invariant | Validation rule only; no I/O |
| ApiGatewayModule | [apps/api-gateway/src/api-gateway.module.ts:4](../../apps/api-gateway/src/api-gateway.module.ts) | Root composition; delegates entry-point setup to controller module | Extracted or composed through DI |
| ApiGatewayControllerModule | [apps/api-gateway/src/controllers/api-gateway-controller.module.ts:20](../../apps/api-gateway/src/controllers/api-gateway-controller.module.ts) | Single owner of GraphQL/client/provider registration | Extracted or composed through DI |
| CityRankingResolver | [apps/api-gateway/src/controllers/resolvers/city-ranking.resolver.ts:5](../../apps/api-gateway/src/controllers/resolvers/city-ranking.resolver.ts) | GraphQL argument/result mapping | Delegates to injected service |
| DomainCommandResolver | [apps/api-gateway/src/controllers/resolvers/domain-command.resolver.ts:5](../../apps/api-gateway/src/controllers/resolvers/domain-command.resolver.ts) | GraphQL argument/result mapping | Delegates to injected service |
| WorkerHealthResolver | [apps/api-gateway/src/controllers/resolvers/worker-health.resolver.ts:5](../../apps/api-gateway/src/controllers/resolvers/worker-health.resolver.ts) | GraphQL argument/result mapping | Delegates to injected service |
| CityLocationType | [apps/api-gateway/src/controllers/types/city-ranking.type.ts:23](../../apps/api-gateway/src/controllers/types/city-ranking.type.ts) | GraphQL output schema | Schema metadata only |
| ActivityEvaluationType | [apps/api-gateway/src/controllers/types/city-ranking.type.ts:35](../../apps/api-gateway/src/controllers/types/city-ranking.type.ts) | GraphQL output schema | Schema metadata only |
| DailyCityRankingType | [apps/api-gateway/src/controllers/types/city-ranking.type.ts:45](../../apps/api-gateway/src/controllers/types/city-ranking.type.ts) | GraphQL output schema | Schema metadata only |
| CityRankingType | [apps/api-gateway/src/controllers/types/city-ranking.type.ts:52](../../apps/api-gateway/src/controllers/types/city-ranking.type.ts) | GraphQL output schema | Schema metadata only |
| CommandReceiptType | [apps/api-gateway/src/controllers/types/command-receipt.type.ts:4](../../apps/api-gateway/src/controllers/types/command-receipt.type.ts) | GraphQL output schema | Schema metadata only |
| WorkerHealthType | [apps/api-gateway/src/controllers/types/worker-health.type.ts:3](../../apps/api-gateway/src/controllers/types/worker-health.type.ts) | GraphQL output schema | Schema metadata only |
| DomainCommandFactory | [apps/api-gateway/src/domain/domain-command.factory.ts:24](../../apps/api-gateway/src/domain/domain-command.factory.ts) | Construct validated commands and correlated receipts | Extracted or composed through DI |
| CommandCityDto | [apps/api-gateway/src/dto/domain-command.dto.ts:14](../../apps/api-gateway/src/dto/domain-command.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| CommandCoordinatesDto | [apps/api-gateway/src/dto/domain-command.dto.ts:22](../../apps/api-gateway/src/dto/domain-command.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| CityRankingGatewayService | [apps/api-gateway/src/services/city-ranking.service.ts:16](../../apps/api-gateway/src/services/city-ranking.service.ts) | Ranking RPC and GraphQL error mapping | Retained cohesive responsibility |
| DomainCommandService | [apps/api-gateway/src/services/domain-command.service.ts:9](../../apps/api-gateway/src/services/domain-command.service.ts) | Publication orchestration; delegates validation and command construction to factory | Extracted or composed through DI |
| WorkerHealthService | [apps/api-gateway/src/services/worker-health.service.ts:17](../../apps/api-gateway/src/services/worker-health.service.ts) | Worker health RPCs and transport timeout mapping | Retained cohesive responsibility |
| CityForecastQueryHandler | [apps/weather-worker/src/controllers/city-forecast-query.handler.ts:12](../../apps/weather-worker/src/controllers/city-forecast-query.handler.ts) | RPC request/result and error mapping; delegates domain execution | Retained cohesive responsibility |
| WeatherCommandHandler | [apps/weather-worker/src/controllers/weather-command.handler.ts:21](../../apps/weather-worker/src/controllers/weather-command.handler.ts) | Weather command orchestration; receives an injected consumer port | Extracted or composed through DI |
| WeatherHealthHandler | [apps/weather-worker/src/controllers/weather-health.handler.ts:9](../../apps/weather-worker/src/controllers/weather-health.handler.ts) | Aggregate infrastructure readiness, without weather or activity rules | Retained cohesive responsibility |
| WeatherQueryHandler | [apps/weather-worker/src/controllers/weather-query.handler.ts:10](../../apps/weather-worker/src/controllers/weather-query.handler.ts) | RPC request/error mapping; delegates current-weather provider | Retained cohesive responsibility |
| OpenMeteoForecastRequestFactory | [apps/weather-worker/src/data-providers/open-meteo-forecast-request.factory.ts:4](../../apps/weather-worker/src/data-providers/open-meteo-forecast-request.factory.ts) | Map domain forecast window to upstream parameters and explicit units | Extracted or composed through DI |
| OpenMeteoJsonClient | [apps/weather-worker/src/data-providers/open-meteo-json.client.ts:13](../../apps/weather-worker/src/data-providers/open-meteo-json.client.ts) | JSON query/cache adapter; endpoint and TTL configuration injected | Extracted or composed through DI |
| OpenMeteoConfiguration | [apps/weather-worker/src/data-providers/open-meteo.configuration.ts:6](../../apps/weather-worker/src/data-providers/open-meteo.configuration.ts) | Endpoint, credentials and cache-duration configuration | Extracted or composed through DI |
| OpenMeteoProvider | [apps/weather-worker/src/data-providers/open-meteo.provider.ts:10](../../apps/weather-worker/src/data-providers/open-meteo.provider.ts) | Current-weather HTTP/cache adapter; coordinate validation and configuration extracted | Extracted or composed through DI |
| OpenMeteoApiError | [apps/weather-worker/src/data-providers/open-meteo.provider.ts:155](../../apps/weather-worker/src/data-providers/open-meteo.provider.ts) | Typed upstream HTTP error | Retained cohesive responsibility |
| CitySelectionPolicy | [apps/weather-worker/src/domain/city-selection.policy.ts:3](../../apps/weather-worker/src/domain/city-selection.policy.ts) | Single first-candidate selection rule without provider mapping | Extracted or composed through DI |
| DailySnowDepthPolicy | [apps/weather-worker/src/domain/daily-snow-depth.policy.ts:11](../../apps/weather-worker/src/domain/daily-snow-depth.policy.ts) | Complete-coverage snow maximum using the 24-observation DTO | Extracted or composed through DI |
| ForecastSnapshotFactory | [apps/weather-worker/src/domain/forecast-snapshot.factory.ts:15](../../apps/weather-worker/src/domain/forecast-snapshot.factory.ts) | Merge provenance, compute content identity and validate snapshot | Extracted or composed through DI |
| ForecastWindowPolicy | [apps/weather-worker/src/domain/forecast-window.policy.ts:4](../../apps/weather-worker/src/domain/forecast-window.policy.ts) | Single seven-date city-local window rule | Extracted or composed through DI |
| MarineCoveragePolicy | [apps/weather-worker/src/domain/marine-coverage.policy.ts:5](../../apps/weather-worker/src/domain/marine-coverage.policy.ts) | Observed marine coverage and 50 km applicability rule | Extracted or composed through DI |
| WeatherPolicyModule | [apps/weather-worker/src/domain/weather-policy.module.ts:18](../../apps/weather-worker/src/domain/weather-policy.module.ts) | Dependency composition | Provider binding only |
| DailySnowCoverageDto | [apps/weather-worker/src/dto/daily-snow-coverage.dto.ts:5](../../apps/weather-worker/src/dto/daily-snow-coverage.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| ForecastSnapshotDto | [apps/weather-worker/src/dto/forecast-snapshot.dto.ts:18](../../apps/weather-worker/src/dto/forecast-snapshot.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| OpenMeteoCityDto | [apps/weather-worker/src/dto/open-meteo-response.dto.ts:29](../../apps/weather-worker/src/dto/open-meteo-response.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| OpenMeteoGeocodingResponseDto | [apps/weather-worker/src/dto/open-meteo-response.dto.ts:74](../../apps/weather-worker/src/dto/open-meteo-response.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| OpenMeteoDailyDatesDto | [apps/weather-worker/src/dto/open-meteo-response.dto.ts:83](../../apps/weather-worker/src/dto/open-meteo-response.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| OpenMeteoWeatherDailyDto | [apps/weather-worker/src/dto/open-meteo-response.dto.ts:95](../../apps/weather-worker/src/dto/open-meteo-response.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| OpenMeteoSnowHourlyDto | [apps/weather-worker/src/dto/open-meteo-response.dto.ts:134](../../apps/weather-worker/src/dto/open-meteo-response.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| OpenMeteoForecastResponseDto | [apps/weather-worker/src/dto/open-meteo-response.dto.ts:151](../../apps/weather-worker/src/dto/open-meteo-response.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| OpenMeteoMarineDailyDto | [apps/weather-worker/src/dto/open-meteo-response.dto.ts:170](../../apps/weather-worker/src/dto/open-meteo-response.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| OpenMeteoMarineResponseDto | [apps/weather-worker/src/dto/open-meteo-response.dto.ts:184](../../apps/weather-worker/src/dto/open-meteo-response.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| OpenMeteoCurrentDto | [apps/weather-worker/src/dto/open-meteo-response.dto.ts:209](../../apps/weather-worker/src/dto/open-meteo-response.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| OpenMeteoCurrentResponseDto | [apps/weather-worker/src/dto/open-meteo-response.dto.ts:245](../../apps/weather-worker/src/dto/open-meteo-response.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| WeatherCacheSignatureDto | [apps/weather-worker/src/dto/weather-cache.dto.ts:17](../../apps/weather-worker/src/dto/weather-cache.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| WeatherCacheQueryDto | [apps/weather-worker/src/dto/weather-cache.dto.ts:24](../../apps/weather-worker/src/dto/weather-cache.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| WeatherCacheWriteDto | [apps/weather-worker/src/dto/weather-cache.dto.ts:35](../../apps/weather-worker/src/dto/weather-cache.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| WeatherCoordinatesDto | [apps/weather-worker/src/dto/weather-coordinates.dto.ts:5](../../apps/weather-worker/src/dto/weather-coordinates.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| WeatherCoordinatesInputDto | [apps/weather-worker/src/dto/weather-coordinates.dto.ts:19](../../apps/weather-worker/src/dto/weather-coordinates.dto.ts) | Declarative input contract | DTO decorators only; no I/O |
| WeatherDatabaseLifecycle | [apps/weather-worker/src/infrastructure/weather-database.module.ts:19](../../apps/weather-worker/src/infrastructure/weather-database.module.ts) | Connection, TTL-index setup and cleanup lifecycle | Retained cohesive responsibility |
| WeatherDatabaseModule | [apps/weather-worker/src/infrastructure/weather-database.module.ts:45](../../apps/weather-worker/src/infrastructure/weather-database.module.ts) | Dependency composition | Provider binding only |
| WeatherPersistenceModule | [apps/weather-worker/src/infrastructure/weather-persistence.module.ts:6](../../apps/weather-worker/src/infrastructure/weather-persistence.module.ts) | Dependency composition | Provider binding only |
| MongoWeatherApiQueryCacheRepository | [apps/weather-worker/src/mongo-weather-api-query-cache.repository.ts:17](../../apps/weather-worker/src/mongo-weather-api-query-cache.repository.ts) | Mongo persistence; validation delegated to cache DTOs and constraints | Extracted or composed through DI |
| CityForecastService | [apps/weather-worker/src/services/city-forecast.service.ts:12](../../apps/weather-worker/src/services/city-forecast.service.ts) | Acquisition orchestration; delegates request construction, window and snapshot rules | Extracted or composed through DI |
| OpenMeteoResponseParser | [apps/weather-worker/src/services/open-meteo-response-parser.service.ts:15](../../apps/weather-worker/src/services/open-meteo-response-parser.service.ts) | Response decoding and mapping; delegates city selection, snow coverage and DTO validation | Extracted or composed through DI |
| WeatherDatabaseHealth | [apps/weather-worker/src/services/weather-database-health.service.ts:5](../../apps/weather-worker/src/services/weather-database-health.service.ts) | Mongo availability probe | Retained cohesive responsibility |
| NullableNumberRange | [apps/weather-worker/src/utils/open-meteo.constraints.ts:17](../../apps/weather-worker/src/utils/open-meteo.constraints.ts) | One cross-field validation invariant | Validation rule only; no I/O |
| MatchingTimeSeriesLength | [apps/weather-worker/src/utils/open-meteo.constraints.ts:29](../../apps/weather-worker/src/utils/open-meteo.constraints.ts) | One cross-field validation invariant | Validation rule only; no I/O |
| OrderedTemperatureRange | [apps/weather-worker/src/utils/open-meteo.constraints.ts:37](../../apps/weather-worker/src/utils/open-meteo.constraints.ts) | One cross-field validation invariant | Validation rule only; no I/O |
| CurrentForecastWindow | [apps/weather-worker/src/utils/open-meteo.constraints.ts:55](../../apps/weather-worker/src/utils/open-meteo.constraints.ts) | One cross-field validation invariant | Validation rule only; no I/O |
| NonFutureTimestamp | [apps/weather-worker/src/utils/open-meteo.constraints.ts:74](../../apps/weather-worker/src/utils/open-meteo.constraints.ts) | One cross-field validation invariant | Validation rule only; no I/O |
| UnexpiredTimestamp | [apps/weather-worker/src/utils/open-meteo.constraints.ts:81](../../apps/weather-worker/src/utils/open-meteo.constraints.ts) | One cross-field validation invariant | Validation rule only; no I/O |
| CacheParameters | [apps/weather-worker/src/utils/weather-cache.constraints.ts:9](../../apps/weather-worker/src/utils/weather-cache.constraints.ts) | One cross-field validation invariant | Validation rule only; no I/O |
| CacheExpiry | [apps/weather-worker/src/utils/weather-cache.constraints.ts:21](../../apps/weather-worker/src/utils/weather-cache.constraints.ts) | One cross-field validation invariant | Validation rule only; no I/O |
| CacheWriteTime | [apps/weather-worker/src/utils/weather-cache.constraints.ts:28](../../apps/weather-worker/src/utils/weather-cache.constraints.ts) | One cross-field validation invariant | Validation rule only; no I/O |
| WeatherInputValidator | [apps/weather-worker/src/utils/weather-input.validator.ts:6](../../apps/weather-worker/src/utils/weather-input.validator.ts) | Transform and validate DTOs without implicit conversion | Extracted or composed through DI |
| WeatherApiQueryCacheRepository | [apps/weather-worker/src/weather-api-query-cache.repository.ts:12](../../apps/weather-worker/src/weather-api-query-cache.repository.ts) | Abstract persistence port | Interface for injection |
| WeatherWorkerModule | [apps/weather-worker/src/weather-worker.module.ts:20](../../apps/weather-worker/src/weather-worker.module.ts) | Dependency composition | Provider binding only |
| CityQueryError | [libs/contracts/src/city-query.ts:15](../../libs/contracts/src/city-query.ts) | Typed domain-query error | Retained cohesive responsibility |
| JetStreamCommandBus | [libs/messaging/src/jetstream-command-bus.ts:80](../../libs/messaging/src/jetstream-command-bus.ts) | Generic stream compatibility and durable command publication | Retained cohesive responsibility |
| JetStreamCommandConsumer | [libs/messaging/src/jetstream-command-consumer.ts:25](../../libs/messaging/src/jetstream-command-consumer.ts) | Generic durable consumption and acknowledgement/retry lifecycle; consumer port added | Added consumer port; transport behavior retained |
| JetStreamEventStore | [libs/messaging/src/jetstream-event-store.ts:18](../../libs/messaging/src/jetstream-event-store.ts) | Generic event-stream setup and durable append | Retained cohesive responsibility |

## Retired classes

- ApiGatewayController: previously unregistered Hello World route; removed obsolete scaffold.
- ApiGatewayService: only supplied that unused Hello World response.

## Validation

Full unit command: node --experimental-vm-modules ./node_modules/jest/bin/jest.js --runInBand.

Full typecheck: tsc -p tsconfig.check.json.

Unit tests exercise domain decisions and failure behavior using Nest TestingModule and provider overrides. HTTP, message-broker and database integration checks are separate from unit validation.

### Recorded results

- Full unit suite: 59 suites, 585 tests passed.
- Additional production-module DI checks: 2 suites, 2 tests passed.
- Total distinct verified unit cases: 587.
- After the type-only import correction, all 13 affected handler/rule/module tests passed again.
- After the command Promise error-contract correction, all 3 command-service tests passed again.
- Full repository typecheck passed.
- Production builds passed for api-gateway, weather-worker and activity-ranking-worker.
- External NATS/MongoDB/PostgreSQL integration and live Open-Meteo checks were not run.
- Local diagnostic logs and JSON test results are stored only in .codex.
