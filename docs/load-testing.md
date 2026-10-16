# Worker load tests

The runner measures two different layers for both workers:

| Mode               | Weather                                                   | Activity ranking                        | Included time                                                                          |
| ------------------ | --------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------- |
| `repository-write` | Replace/upsert one cached response document               | Transactional upsert of one ranking row | Repository validation, mapping, driver, pool wait and database acknowledgement         |
| `worker-read`      | Read a seeded MongoDB cache entry and map current weather | Read one seeded PostgreSQL ranking      | Load driver, NATS request/reply, worker handler, repository and response serialization |

The NATS mode starts each worker in a separate Node process and measures its CPU time, RSS, event-loop utilization and event-loop delay. Repository writes execute in the load-driver process and do not report worker CPU. These tests do not measure durable command acknowledgement, event publication, forecast retrieval, scoring, or the public GraphQL Gateway.

## Run

```powershell
pnpm install
pnpm load:up
pnpm load:build
pnpm load:workers --worker both --mode all --concurrency 1,10,50 --iterations 1000 --warmup 100 --dataset 1000 --payload-bytes 512 --runs 3
```

`compose.load.yaml` uses the project name `city-ranks-load`, loopback ports 4223/27018/5435, separate databases and separate volumes. It assigns one CPU and 512 MiB to each database container; MongoDB's WiredTiger cache is set to 0.25 GiB. PostgreSQL keeps its image defaults, including synchronous commit. Both drivers use the same configured pool limit, ten by default. Workers run outside containers and do not have CPU or memory limits.

The runner ignores the normal `.env`. Optional `.env.load` settings follow `.env.load.example`. Targets must use loopback hosts and database names ending in `_load`; this prevents accidental writes to ordinary application databases. It runs the PostgreSQL migration, creates MongoDB indexes, seeds fixtures, warms each scenario, and deletes only its own fixtures afterward. Each run has unique fixture keys. Child processes and database clients are closed on completion or failure.

Open-Meteo calls are disabled. Weather fixtures are synthetic, seeded responses with a fixed observation time and an unreachable fixture endpoint. A missing or expired cache entry fails the run instead of calling the public API. Both fixture types carry a synthetic string with the requested `--payload-bytes` length. Their complete stored and returned payload sizes still differ, and the report records fixture byte counts.

Options include `--worker weather|activity-ranking|both`, `--mode repository-write|worker-read|all`, `--pool`, `--dataset`, `--iterations`, `--warmup`, `--concurrency`, `--payload-bytes` and `--runs`. Warmup is excluded from reported measurements. Workers alternate order across repeat runs. `--max-p95-ms 100` adds a scenario latency threshold. Any measured error or failed threshold produces a nonzero exit code; a warmup failure aborts the run.

## Results

Reports and child logs are saved exclusively under `.codex/load/`. Each JSON report includes configuration, Node version, host CPU/memory metadata, fixture sizes and per-scenario results:

- completed and failed operations, error rate and failure categories;
- successful operations per second;
- p50, p95, p99 and maximum successful-operation latency;
- worker CPU time, RSS, event-loop utilization and p99 event-loop delay for NATS reads.

Compose resource values in the report are declared defaults, not measured container telemetry. Record actual container configuration and database versions when publishing results. CPU/RSS values exclude database containers and the load driver.

The generator uses bounded concurrency and waits for each operation before issuing another. This is a closed-loop workload: it measures latency at each chosen concurrency, rather than enforcing an independent arrival rate. Long requests reduce the rate of later requests, so it does not measure queue growth under a fixed offered rate. Keep this limitation visible when presenting saturation results.

The two repositories have different schemas, query plans, transaction costs and response sizes. A faster worker result is evidence about that domain path under the recorded conditions; it is not proof that MongoDB or PostgreSQL is faster in general. For an interview, report repeat runs, workload and durability settings, plot throughput alongside p95/p99 and error rates, and explain the design tradeoffs. A controlled database-engine comparison would require matching schemas/access patterns, payloads, acknowledgement guarantees and resource measurements separately.

### Recorded benchmark: October 16, 2026

This run (`fdbbe2dd-dd3a-433d-9c95-97116d8b2e69`) was recorded at `2026-10-16T12:14:38.925Z`. It completed all 36 scenarios: 36,000 successful operations and zero errors. `maxP95Ms` was unset, so passing indicates error-free scenarios; no latency threshold was applied.

The run used Node.js 24.11.1 on Windows with an AMD Ryzen 9 4900HS host (16 logical CPUs). The load Compose configuration sets each database container to one CPU and 512 MiB; these are configured limits, not measured database resource consumption. The configured image tags are MongoDB 8.0 and PostgreSQL 16 Alpine. The connection pool was 10. MongoDB used `w: 1` with journaling enabled; PostgreSQL used its default synchronous commit setting. Upstream requests were disabled.

Each scenario measured 1,000 operations after a 100-operation warmup, against a 1,000-item dataset, at concurrency 1, 10, and 50, with three runs. The synthetic payload option was 512 bytes; the report records complete fixture sizes of 780 bytes for weather and 760 bytes for ranking. Throughput is the median across the three runs, with the observed min-max range in parentheses. Latency percentiles are medians of the three run-level values; the p95 column also shows the worst run-level p95.

#### Repository writes

| Service and operation | Concurrency | Successful ops/s, median (range) | p50 | p95, median (worst run) | p99, median |
| --- | ---: | ---: | ---: | ---: | ---: |
| Weather - MongoDB document upsert | 1 | 279.9 (273.2-283.8) | 3.1 ms | 4.7 ms (4.9 ms) | 5.7 ms |
| Weather - MongoDB document upsert | 10 | 1,265.8 (930.1-1,454.5) | 6.7 ms | 10.0 ms (56.8 ms) | 63.7 ms |
| Weather - MongoDB document upsert | 50 | 1,356.7 (859.4-1,463.4) | 35.0 ms | 43.4 ms (105.1 ms) | 45.7 ms |
| Activity ranking - PostgreSQL transactional row upsert | 1 | 194.1 (190.2-202.8) | 5.1 ms | 6.0 ms (6.3 ms) | 7.3 ms |
| Activity ranking - PostgreSQL transactional row upsert | 10 | 877.6 (861.7-919.8) | 11.0 ms | 15.2 ms (15.8 ms) | 18.3 ms |
| Activity ranking - PostgreSQL transactional row upsert | 50 | 880.2 (857.2-1,021.9) | 51.4 ms | 68.9 ms (102.5 ms) | 71.8 ms |

#### Worker reads

Worker reads include the NATS request/reply path, worker handler, repository, and response serialization; they are not database-only measurements.

| Service | Concurrency | Successful ops/s, median (range) | p50 | p95, median (worst run) | p99, median |
| --- | ---: | ---: | ---: | ---: | ---: |
| Weather | 1 | 201.8 (195.7-205.0) | 4.7 ms | 5.7 ms (6.2 ms) | 7.6 ms |
| Weather | 10 | 676.5 (636.8-833.6) | 10.2 ms | 46.5 ms (47.9 ms) | 65.7 ms |
| Weather | 50 | 750.2 (606.7-894.4) | 58.0 ms | 97.8 ms (107.6 ms) | 133.5 ms |
| Activity ranking | 1 | 229.3 (224.7-232.9) | 4.3 ms | 5.0 ms (5.5 ms) | 5.9 ms |
| Activity ranking | 10 | 1,195.5 (1,092.8-1,318.3) | 8.1 ms | 10.8 ms (11.7 ms) | 12.2 ms |
| Activity ranking | 50 | 1,105.2 (971.0-1,189.3) | 44.7 ms | 51.2 ms (59.7 ms) | 56.7 ms |

At concurrency 50, median worker event-loop utilization was 89.1% for weather and 99.5% for activity ranking. Median worker RSS was 176.5 MiB and 110.5 MiB respectively. Worker CPU and RSS exclude the database containers and load driver.

These are closed-loop synthetic domain workloads with different schemas, query plans, transaction costs, payload sizes, and acknowledgement settings. The results describe these tested paths and limits only; they do not establish general MongoDB-versus-PostgreSQL performance or production capacity. The throughput plateau and higher tail latencies at concurrency 50 are signals for follow-up testing under representative workload and resource monitoring.

## Verification

```powershell
pnpm test:repositories
pnpm test:integration:repositories
```

Focused tests exercise injection bindings, DI, rollback, cache expiry predicates, cache coalescing and harness accounting without database services. The integration suite requires the ordinary Compose dependencies and checks actual PostgreSQL and MongoDB round trips. Live load runs require Docker and the isolated load stack. No benchmark results are included until a live run succeeds.
