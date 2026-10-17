# City Ranks Backend Architecture and Ranking Rationale

**Architecture snapshot:** Based on develop commit 0f6bfe8232c72f2f52d7e09d40f1bde24b86ed80.

**Purpose:** Describe the backend responsibilities, the data flow that produces a city ranking, the reasons for the main architectural boundaries, and the code that decides whether each activity can be ranked on a given date.

The external API contract is documented separately in the [project overview](../docs/project-overview.md). Durable command and event processing details are documented in the [architecture decision trail](../docs/decision-trail.md) and [repository design](../docs/repositories.md). This document focuses on the backend ranking data path.

The backend consists of an application gateway, an Activity Ranking Worker, a Weather Worker, MongoDB for cached provider responses, PostgreSQL for ranking results, and Open-Meteo as the weather-data provider. The two domain workers own their business responsibilities and persistence boundaries. Activity scores are explainable heuristics whose assumptions remain provisional; see [business assumptions](../docs/city-ranking-assumptions.md).

## 1. Backend data flow

~~~mermaid
flowchart LR
    Gateway[ApiGateway] --> Broker["Message Broker (NATS / JetStream)"]
    Broker --> Weather[Weather Worker]
    Broker --> Ranking[Activity Ranking Worker]
    Weather --> WeatherStore[(Weather persistence: MongoDB)]
    Ranking --> RankingStore[(Ranking persistence: PostgreSQL)]
~~~

### Flow explanation

1. ApiGateway receives the city-ranking request, normalizes the city input, and passes the application request to the Activity Ranking Worker. The gateway-side request handling is in the [city-ranking service](../apps/api-gateway/src/services/city-ranking.service.ts).
2. The Activity Ranking Worker checks PostgreSQL for a result matching the normalized city and current ranking-policy version. It reuses the result only while its forecast is fresh and its seven-day window still starts on the city's current local date. The lookup and freshness checks are in the [ranking service](../apps/activity-ranking-worker/src/services/city-ranking.service.ts), [freshness policy](../apps/activity-ranking-worker/src/domain/ranking-freshness.policy.ts), and [PostgreSQL repository](../apps/activity-ranking-worker/src/postgres-city-ranking.repository.ts).
3. When there is no reusable result, the ranking worker requests a forecast from the Weather Worker. The Weather Worker resolves the city through Open-Meteo geocoding, uses the selected location's IANA timezone to determine the next seven local calendar dates, and assembles the forecast inputs. The request and forecast handling are in the [ranking service](../apps/activity-ranking-worker/src/services/city-ranking.service.ts), [forecast handler](../apps/weather-worker/src/controllers/city-forecast-query.handler.ts), and [CityForecastService](../apps/weather-worker/src/services/city-forecast.service.ts).
4. The Weather Worker reads provider responses from its MongoDB cache. On a cache miss it calls Open-Meteo, validates the responses, stores them, and maps the data into the shared forecast model. See [OpenMeteoJsonClient](../apps/weather-worker/src/data-providers/open-meteo-json.client.ts), [response parser](../apps/weather-worker/src/services/open-meteo-response-parser.service.ts), and [forecast policies](../apps/weather-worker/src/domain/).
5. The Activity Ranking Worker evaluates skiing, surfing, outdoor sightseeing, and indoor sightseeing for each of the seven dates. It applies daily eligibility gates, computes scores and explanations, and ranks eligible activities within each date. The rule composition is in [RankingPolicy](../apps/activity-ranking-worker/src/domain/ranking-policy.ts); daily ordering is in [rankDay](../apps/activity-ranking-worker/src/domain/daily-ranking.ts).
6. The ranking worker persists the result and its city/policy query pointer in one PostgreSQL transaction. It then returns the result through ApiGateway. The result carries the resolved city, seven dates, completeness, policy and fetch metadata, and each activity's state, score, rank, reason codes, and explanation. The response model is in [city-ranking.ts](../libs/models/src/city-ranking.ts).


## 2. Where the business logic is handled

| Business behavior | Current owner | How it works |
| --- | --- | --- |
| City input normalization and error codes | Shared contracts, used by ApiGateway and workers | normalizeCity trims, Unicode-normalizes, and bounds city names. Typed errors distinguish invalid input, an unknown city, upstream unavailability, and ranking unavailability. See [city-query.ts](../libs/contracts/src/city-query.ts). |
| City resolution | Weather Worker | The first Open-Meteo geocoding match is selected. The resolved name, country, region, coordinates, and timezone are returned so clients can see which place was evaluated. See [CitySelectionPolicy](../apps/weather-worker/src/domain/city-selection.policy.ts). |
| Seven-day window | Weather Worker and shared calendar model | The window is today plus six calendar days in the resolved city's timezone. Calendar-date arithmetic preserves seven dates across daylight-saving changes. See [ForecastWindowPolicy](../apps/weather-worker/src/domain/forecast-window.policy.ts) and [calendar.ts](../libs/models/src/calendar.ts). |
| Forecast acquisition and validation | Weather Worker | Open-Meteo geocoding, land, snow, and marine inputs are parsed into validated domain-shaped data. Provider-specific payloads do not become the ranking worker's persistence contract. See [weather DTOs](../apps/weather-worker/src/dto/) and [response parser](../apps/weather-worker/src/services/open-meteo-response-parser.service.ts). |
| Skiing suitability | Activity Ranking Worker | Uses city-grid snow depth and weather comfort as a proxy. A resort, lift, or snow-sport facility is not discovered or asserted. Incomplete required hourly snow observations produce unknown suitability. See [skiing rule](../apps/activity-ranking-worker/src/domain/rules/skiing.rule.ts) and [snow-depth policy](../apps/weather-worker/src/domain/daily-snow-depth.policy.ts). |
| Surfing suitability | Weather Worker and Activity Ranking Worker | The weather worker classifies marine coverage, including whether an observed marine grid is within the 50 km scope. The ranking rule uses wave, period, and wind measurements. This is a daily heuristic, not a surf-window, beach-access, tide, or hazard assessment. See [marine coverage policy](../apps/weather-worker/src/domain/marine-coverage.policy.ts) and [surfing rule](../apps/activity-ranking-worker/src/domain/rules/surfing.rule.ts). |
| Outdoor sightseeing suitability | Activity Ranking Worker | A provisional temperature, precipitation, wind, and thunderstorm heuristic. See [outdoor sightseeing rule](../apps/activity-ranking-worker/src/domain/rules/outdoor-sightseeing.rule.ts). |
| Indoor sightseeing suitability | Activity Ranking Worker | A weather-preference heuristic derived from the outdoor score. It does not evaluate attractions, opening hours, or travel disruption. See [indoor sightseeing rule](../apps/activity-ranking-worker/src/domain/rules/indoor-sightseeing.rule.ts). |
| Scores, ranks, ties, and explanations | Activity Ranking Worker | Scores are clamped to a provisional 0–100 range and rounded before comparison. Competition ranking is performed separately for each date, so tied scores share a rank and later ranks have gaps. Each rule supplies reason codes and a human-readable explanation. See [ranking score helpers](../apps/activity-ranking-worker/src/domain/ranking-score.ts), [daily ranking](../apps/activity-ranking-worker/src/domain/daily-ranking.ts), and the four rules above. |
| Missing or out-of-scope conditions | Shared model and ranking rules | All four activities remain present. Missing required inputs produce INSUFFICIENT_DATA with null score and rank; explicit scope exclusions produce NOT_APPLICABLE; a numeric zero is still a valid ranked score. Day and whole-result completeness are separate from freshness. See [city-ranking.ts](../libs/models/src/city-ranking.ts) and [ranking-score.ts](../apps/activity-ranking-worker/src/domain/ranking-score.ts). |
| Persistence and freshness | Each worker owns its repository | The Weather Worker owns the Open-Meteo response cache. The Activity Ranking Worker owns ranking results and query pointers. No worker reads another worker's database directly. See [repository design](../docs/repositories.md). |

### Daily eligibility and ranking conditions by activity

#### What “active in the ranking” means

Every forecast date is passed to all four activity rules. The algorithm therefore returns an evaluation row for skiing, surfing, outdoor sightseeing, and indoor sightseeing on every date; it does not remove an activity from the response.

An activity is **RANKED** when the rule has the required numeric weather inputs and the activity falls within the rule's evaluation scope. RANKED means “eligible for a weather-suitability score and comparison with the other ranked activities for this same city and date.” It does not verify that a resort, beach, attraction, or indoor venue exists, is open, or is accessible to the user.

A score of zero is still **RANKED**: the evidence is sufficient and the modeled weather is very unsuitable. **INSUFFICIENT_DATA** means required observations are missing or invalid, so the algorithm cannot responsibly calculate a score. **NOT_APPLICABLE** means an explicit scope rule excludes the activity. Both non-ranked states have a null score and rank. These distinctions are defined in the [shared ranking model](../libs/models/src/city-ranking.ts) and constructed by [ranking-score.ts](../apps/activity-ranking-worker/src/domain/ranking-score.ts).

#### Skiing

**When it is ranked:** The date must have numeric minimum and maximum temperature, maximum wind speed, weather code, snowfall, and a daily maximum snow depth. The snow maximum is accepted only when all 24 hourly model observations selected for that date are present and valid. If any required field is missing, the result is INSUFFICIENT_DATA. With complete inputs, skiing is RANKED even when snow depth is zero or a thunderstorm forces the score to zero.

**Why these conditions exist:** Snow cover is the basic weather proxy for whether the city-grid conditions could support skiing. Temperature and wind approximate comfort, while snowfall above the provisional amount reduces the score. The 24-observation requirement avoids treating a partial day as a reliable daily maximum; the exact treatment of 23- or 25-hour daylight-saving dates is still an open business question. The model deliberately does not claim that a ski resort or slope is present at the city coordinates.

**Scoring rule:** The snow factor is min(1, daily maximum snow depth / 0.30 m). The comfort factor is the 0–100 clamp of 100 minus 5 times the distance of mean temperature from -5 °C, 2 times wind above 20 km/h, and 2 times snowfall above 10 cm. The score is snow factor multiplied by comfort. A weather code of 95 or higher overrides the score to zero. The -5 °C comfort target, 0.30 m snow saturation, wind and snowfall penalties are provisional assumptions, not calibrated resort-operability thresholds.

**Code:** [SkiingRule](../apps/activity-ranking-worker/src/domain/rules/skiing.rule.ts) checks the daily fields, calculates the score, and returns RANKED when they validate. [SkiingRankingConditionsDto](../apps/activity-ranking-worker/src/dto/ranking-conditions.dto.ts) defines the required ranking inputs. [DailySnowDepthPolicy](../apps/weather-worker/src/domain/daily-snow-depth.policy.ts) enforces complete 24-hour snow coverage, and [OpenMeteoResponseParser](../apps/weather-worker/src/services/open-meteo-response-parser.service.ts) maps the selected date's observations into the daily forecast. The business assumption is BQ-05 in [city-ranking-assumptions.md](../docs/city-ranking-assumptions.md).

#### Surfing

**When it is ranked:** First, the forecast-level marine classification must be AVAILABLE: the marine grid must have at least one date with both wave height and wave period observed, and that grid must be no more than 50 km from the resolved city. Then, on the particular date being evaluated, wave-height maximum, wave-period maximum, maximum wind speed, and weather code must all be numeric. A missing date-specific input or unavailable marine data produces INSUFFICIENT_DATA. If marine observations exist and the grid is more than 50 km away, the forecast-level result is NOT_APPLICABLE for surfing.

**Why these conditions exist:** A marine grid far from the city is considered too weak a proxy for that city's surfing conditions, so the policy places it outside the evaluation radius rather than assigning a misleading low score. A nearby grid makes the activity eligible for a weather-only estimate; wave size, period, wind, and thunderstorms then affect suitability. The 50 km radius and the daily-maximum approach are provisional. Daily wave-height and period maxima can occur at different hours, and the rule does not account for beach access, tides, wind direction, hazards, or skill level.

**Scoring rule:** Wave suitability is the 0–100 clamp of 100 minus the absolute distance between the daily maximum wave height and the provisional 1.5 m target, scaled by 100 / 1.5. The period factor is min(1, maximum wave period / 10 seconds). The wind factor is the 0–100 clamp of 100 minus 3 times maximum wind above 15 km/h, divided by 100. The score is the product of those factors. A weather code of 95 or higher overrides the score to zero, while remaining RANKED when the required inputs and marine scope checks pass.

**Code:** [MarineCoveragePolicy](../apps/weather-worker/src/domain/marine-coverage.policy.ts) classifies marine evidence and applies the 50 km distance rule; [ForecastSnapshotFactory](../apps/weather-worker/src/domain/forecast-snapshot.factory.ts) places that forecast-level status on the assembled snapshot. [SurfingRule](../apps/activity-ranking-worker/src/domain/rules/surfing.rule.ts) distinguishes NOT_APPLICABLE from INSUFFICIENT_DATA, validates the day inputs, and scores eligible dates. [SurfingRankingConditionsDto](../apps/activity-ranking-worker/src/dto/ranking-conditions.dto.ts) lists the required daily measurements. See BQ-06 in [city-ranking-assumptions.md](../docs/city-ranking-assumptions.md).

#### Outdoor sightseeing

**When it is ranked:** The date must contain numeric minimum and maximum temperature, precipitation, maximum wind speed, and weather code. Missing or invalid required data produces INSUFFICIENT_DATA. With complete inputs the date is RANKED; a thunderstorm code of 95 or higher gives a valid score of zero instead of excluding the activity.

**Why these conditions exist:** Mean temperature approximates general outdoor comfort; precipitation and stronger wind reduce preference. The explicit thunderstorm override reflects the assumption that thunderstorm conditions make outdoor sightseeing unsuitable, regardless of the other score components. These inputs and thresholds are weather proxies, not a safety forecast or venue-opening check.

**Scoring rule:** The 0–100 clamp of 100 minus 3 times the distance of mean temperature from 20 °C, 5 times precipitation in millimeters, and 1.5 times maximum wind above 15 km/h. A weather code of 95 or higher overrides the result to zero. The 20 °C target and penalty weights are provisional.

**Code:** [OutdoorSightseeingRule](../apps/activity-ranking-worker/src/domain/rules/outdoor-sightseeing.rule.ts) performs the input gate, thunderstorm override, and calculation. [OutdoorRankingConditionsDto](../apps/activity-ranking-worker/src/dto/ranking-conditions.dto.ts) defines the required fields. See BQ-04 in [city-ranking-assumptions.md](../docs/city-ranking-assumptions.md).

#### Indoor sightseeing

**When it is ranked:** Indoor sightseeing reuses the outdoor-sightseeing rule. It is RANKED when that rule can produce a RANKED outdoor evaluation. If outdoor weather inputs are missing or invalid, indoor sightseeing is also INSUFFICIENT_DATA because this implementation derives its indoor score from the outdoor score. It does not independently check for indoor weather or venue data.

**Why these conditions exist:** The exercise asks for both indoor and outdoor suitability, while the implementation has weather data but no venue catalogue. The provisional rule keeps indoor sightseeing as a possible alternative even on a fair-weather day, then raises its preference as outdoor weather becomes less suitable. It is a relative weather preference, not evidence that a user can visit a particular venue.

**Scoring rule:** 40 + 0.6 × (100 − outdoor score). For an outdoor score from 0 to 100, indoor scores range from 100 down to a baseline of 40, so fair outdoor weather does not make indoor sightseeing unavailable. If a thunderstorm makes outdoor score zero, indoor score becomes 100. This baseline and coefficient are provisional product assumptions.

**Code:** [IndoorSightseeingRule](../apps/activity-ranking-worker/src/domain/rules/indoor-sightseeing.rule.ts) calls [OutdoorSightseeingRule](../apps/activity-ranking-worker/src/domain/rules/outdoor-sightseeing.rule.ts), propagates missing-data state, and computes the alternative score. See BQ-07 in [city-ranking-assumptions.md](../docs/city-ranking-assumptions.md).

#### How daily scores become ranks

After all four rules return an evaluation, [RankingPolicy](../apps/activity-ranking-worker/src/domain/ranking-policy.ts) applies them separately to each of the seven forecast dates. [rankDay](../apps/activity-ranking-worker/src/domain/daily-ranking.ts) rounds scored values to two decimals before comparison, ranks only RANKED evaluations, and uses competition ranking: equal scores share a rank and the next rank skips the tied positions. For example, 90, 90, 70, 40 becomes 1, 1, 3, 4. The comparison is only among activities for that one city-date; ranks do not compare different dates or cities.

[rankingCompleteness](../apps/activity-ranking-worker/src/domain/ranking-score.ts) reports COMPLETE when all four activities are ranked for a date, PARTIAL when one to three are ranked, and UNAVAILABLE when none are ranked. Whole-result completeness applies the same rule across all 28 city-date evaluations. This is separate from forecast freshness and does not change any activity's eligibility.

## 3. Architectural decisions and rationale

| Decision | Rationale | Trade-off and boundary |
| --- | --- | --- |
| Keep ApiGateway as the application entry point | A single edge owns external request validation and delegates application work to domain workers. Workers focus on weather acquisition or ranking and do not expose their own public HTTP endpoints. | The gateway is a shared availability boundary and must be scaled and monitored independently. |
| Split weather acquisition from activity ranking | Provider integration, cache freshness, and weather-data validation change for different reasons from the scoring rules and ranking persistence. The split lets each worker own a coherent responsibility and its database. | A cold ranking request depends on both workers, their databases, and Open-Meteo. The service boundary adds operational work and latency. |
| Keep four activities in one ranking worker | All activities consume the same daily forecast and jointly produce the same four-item daily ranking. A shared worker avoids duplicated forecast acquisition and keeps tie handling and completeness consistent across activities. | One worker scales and deploys all four strategies together. A strategy does not have an independent service lifecycle. |
| Keep shared domain contracts and framework-independent result models | Shared city-query types, typed errors, and the city-ranking model keep worker boundaries consistent without sharing database adapters. See [contracts](../libs/contracts/src/) and [models](../libs/models/src/). | Shared contracts create compile-time coordination: a breaking model change can require coordinated worker and gateway releases. |
| Keep the Open-Meteo adapter inside the Weather Worker | Only the worker that owns forecast freshness and cache persistence calls the provider. This prevents provider details and credentials from leaking into the gateway or ranking rules. Strict parsing prevents invalid upstream JSON from being treated as valid business input. | Weather-provider availability and rate limits constrain cold requests. A cold ranking calculation waits for bounded provider requests. |
| Persist provider cache documents in MongoDB | The cache stores endpoint-and-parameter-shaped response documents with an expiry. Cache signatures are derived from the endpoint and sorted query parameters; fresh reads check the deadline directly because TTL deletion is asynchronous. | A second database engine adds deployment and maintenance cost. Its use is a project and load-test choice, not a requirement of the exercise. |
| Persist rankings in PostgreSQL behind a repository port | The worker stores full versioned ranking payloads and a query pointer. A transaction writes the immutable result and updates the pointer together; ordering guards prevent an older fetch from replacing a newer pointer. The JSONB payload preserves the complete seven-day result and its provenance. | JSONB makes the read model convenient but does not normalize every nested evaluation into independently queryable rows. Retention and history-query behavior remain separate product decisions. |
| Put database adapters behind worker-owned repository ports | Business services depend on narrow domain persistence operations, while Knex/PostgreSQL and MongoDB details stay in infrastructure adapters. Worker ownership prevents cross-service database coupling and makes repositories replaceable in focused tests. | The port and adapter layers add code and do not remove the need for schema migrations, indexes, transaction review, or production capacity planning. |
| Isolate scoring behavior in named rules and version the policy | Each activity's weather interpretation is independently readable and replaceable. A policy version is stored with each result and participates in the ranking identity, so results from different formulas are not silently presented as the same calculation. | The scores are heuristic and provisional. Versioning supports traceability; it does not establish that the thresholds are empirically accurate or approved by a product owner. |
| Calculate dates in the resolved city's timezone | City-local calendar dates make the meaning of “next seven days” independent of the server timezone and handle daylight-saving boundaries as dates rather than fixed 24-hour intervals. | The model uses daily aggregates, including for the current date. It does not evaluate remaining hours or activity-specific time windows. |
| Represent missing data, exclusions, and zero scores separately | A missing observation is not equivalent to bad weather, and an out-of-scope activity is not equivalent to either. Explicit states and completeness let clients avoid treating unavailable evidence as a low score. | Partial results can be less comparable. Consumers must display state and completeness along with numeric scores. |
| Reuse only fresh rankings and do not silently fall back to stale results | Fresh stored rankings avoid repeated provider calls; expired data is recomputed on a later request. Marine upstream unavailability can yield a partial result, while required geocoding or land data failure yields a typed error. | There is no scheduled refresh or stale-while-revalidate path. In-flight request coalescing is process-local, not a distributed lock, so concurrent misses across replicas may duplicate work. |


## 4. Explicit assumptions and known limits

The implementation records open product questions in [city-ranking-assumptions.md](../docs/city-ranking-assumptions.md), with code locations marked by BQ-* identifiers. These assumptions remain provisional until calibrated or approved:

- Score weights, comfort thresholds, thunderstorm effects, and cross-activity interpretation are heuristic. The shared 0–100 scale does not mean scores have a calibrated probability or utility interpretation.
- Skiing uses city-grid snow and weather data rather than a chosen resort or elevation.
- Surfing uses daily aggregates; wave height and period maxima may not occur at the same hour. The result says nothing about beach access, tides, offshore wind direction, local hazards, or a surfer's skill.
- Indoor sightseeing expresses a weather preference and does not check whether venues exist or are open.
- Ambiguous names resolve to the first geocoding result; the response exposes the selected identity, and users can add a country or region qualifier.
- Missing marine data may make the result partial. There is no silent stale fallback. Land or geocoding failure is returned as an error.
- Exact snow-hour coverage and differing request-validation length bounds remain documented questions rather than approved product rules.

Several operational guarantees are intentionally not claimed:

- Request coalescing is local to a worker process; distributed refresh coordination is not implemented.
- Automatic scheduled refresh, stale fallback, and bounded ranking-history retention are follow-ups if product or deployment requirements call for them.
- The October 16, 2026 recorded synthetic run covered 36,000 successful operations across 36 scenarios with zero errors; it applied no p95 acceptance threshold because maxP95Ms was unset. At concurrency 50, median write throughput was 1,356.7 ops/s for the Weather Worker cache and 880.2 ops/s for transactional Activity Ranking writes; p95 medians were 43.4 ms and 68.9 ms. Worker reads measured 750.2 and 1,105.2 ops/s at p95 97.8 ms and 51.2 ms. These operations have different schemas, work, payload sizes, and acknowledgement settings; they do not prove general database-engine superiority or exercise the full forecast-to-ranking path. See the [recorded load-test report](../docs/load-testing.md).


## 5. Source map

- [Project overview and external API contract](../docs/project-overview.md)
- [Architecture decision trail, including durable command and event processing](../docs/decision-trail.md)
- [Business questions and ranking assumptions](../docs/city-ranking-assumptions.md)
- [Repository ownership and persistence design](../docs/repositories.md)
- [ApiGateway city-ranking service](../apps/api-gateway/src/services/city-ranking.service.ts)
- [Weather Worker](../apps/weather-worker/src/)
- [Activity Ranking Worker](../apps/activity-ranking-worker/src/)
- [Shared contracts and result models](../libs/contracts/src/)
- [Ranking result model](../libs/models/src/city-ranking.ts)
