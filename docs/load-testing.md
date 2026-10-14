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

## Verification

```powershell
pnpm test:repositories
pnpm test:integration:repositories
```

Focused tests exercise injection bindings, DI, rollback, cache expiry predicates, cache coalescing and harness accounting without database services. The integration suite requires the ordinary Compose dependencies and checks actual PostgreSQL and MongoDB round trips. Live load runs require Docker and the isolated load stack. No benchmark results are included until a live run succeeds.
