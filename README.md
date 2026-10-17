# City Ranks backend

This GraphQL backend ranks skiing, surfing, outdoor sightseeing and indoor sightseeing for seven dates in a city's local timezone. It uses persisted Open-Meteo forecasts. Each date ranks its four activities independently. ApiGateway is the only HTTP service; the weather and ranking workers communicate over NATS and own their data stores.

## Run the production build locally

Prerequisites: Node.js 20.19+ or 22.12+, pnpm, and Docker Compose v2 with Docker running. From the repository root, run the startup script for your operating system:

| Operating system   | Command                                                                           |
| ------------------ | --------------------------------------------------------------------------------- |
| Linux              | `sh ./scripts/start-linux.sh`                                                     |
| macOS              | `sh ./scripts/start-macos.sh`                                                     |
| Windows PowerShell | `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-windows.ps1` |

Each script installs locked dependencies, builds the compiled services, starts NATS JetStream, MongoDB and PostgreSQL, applies migrations, then runs the workers and API gateway from `dist/` with `NODE_ENV=production`. On Windows, each service runs in its own minimized terminal window. Logs and process IDs are stored under `.codex/logs` and `.codex/run`. The local production launcher enables GraphiQL for the API gateway, so [http://localhost:3000/graphql](http://localhost:3000/graphql) opens the browser IDE; other production deployments can enable it with `GRAPHQL_IDE_ENABLED=true`. Stop the services with `node scripts/local-environment.mjs stop`.

## Main assumptions

- The forecast covers today and the following six dates in the resolved city's timezone.
- Scores use a provisional 0–100 weather-suitability scale. Scores are rounded before competition ranking, so ties share a rank.
- Missing required inputs produce `INSUFFICIENT_DATA`; explicit exclusions produce `NOT_APPLICABLE`; zero is a valid score.
- The first Open-Meteo geocoding match is used. A country or region qualifier can narrow a search.
- Scores describe weather suitability, not resort, beach or venue availability. Thresholds still need business calibration.

The GraphQL API exposes `cityRanking`, `workersHealth` and `requestActivityRanking`.

## Further reading

- [Project overview](docs/project-overview.md)
- [Ranking assumptions and open business questions](docs/city-ranking-assumptions.md)
- [Architecture and decision trail](docs/decision-trail.md)
- [Repository design](docs/repositories.md)
- [Worker load-test protocol](docs/load-testing.md)

## Checks

Run `pnpm build`, `pnpm typecheck` and `pnpm test --runInBand` from the repository root. Integration tests require the services described in the [repository guide](docs/repositories.md).
