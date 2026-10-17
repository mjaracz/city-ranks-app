# City Ranks backend

This GraphQL backend ranks skiing, surfing, outdoor sightseeing and indoor sightseeing for seven dates in a city's local timezone. It uses persisted Open-Meteo forecasts. Each date ranks its four activities independently. ApiGateway is the only HTTP service; the weather and ranking workers communicate over NATS and own their data stores.

## Run locally

Prerequisites: Node.js 20.19+ or 22.12+, pnpm, and Docker Compose v2 with Docker running. From the repository root, run the startup script for your operating system:

| Operating system   | Command                                                                           |
| ------------------ | --------------------------------------------------------------------------------- |
| Linux              | `sh ./scripts/start-linux.sh`                                                     |
| macOS              | `sh ./scripts/start-macos.sh`                                                     |
| Windows PowerShell | `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1` |

The script installs locked dependencies, starts NATS JetStream, MongoDB and PostgreSQL, applies migrations, then starts the services. Open [http://localhost:3000/graphql](http://localhost:3000/graphql) after startup. Stop the services with `node scripts/local-environment.mjs stop`.

## Main assumptions

- The forecast covers today and the following six dates in the resolved city's timezone.
- Scores use a provisional 0–100 weather-suitability scale. Scores are rounded before competition ranking, so ties share a rank.
- Missing required inputs produce `INSUFFICIENT_DATA`; explicit exclusions produce `NOT_APPLICABLE`; zero is a valid score.
- The first Open-Meteo geocoding match is used. A country or region qualifier can narrow a search.
- Scores describe weather suitability, not resort, beach or venue availability. Thresholds still need business calibration.

The GraphQL API exposes `cityRanking`, `workersHealth` and `requestActivityRanking`.

## Further reading

- [Project overview](docs/project-overview.md)
- [Solution architecture and functional flow](docs/solution-architecture.md)
- [Ranking assumptions and open business questions](docs/city-ranking-assumptions.md)
- [Architecture and decision trail](docs/decision-trail.md)
- [Repository design](docs/repositories.md)
- [Worker load-test protocol](docs/load-testing.md)

## Checks

Run `pnpm build`, `pnpm typecheck` and `pnpm test --runInBand` from the repository root. Integration tests require the services described in the [repository guide](docs/repositories.md).
