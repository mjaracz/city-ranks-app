import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import type { ClientProxy } from '@nestjs/microservices';
import type { Collection } from 'mongodb';
import type { Knex } from 'knex';
import type { ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { cpus, totalmem, platform } from 'node:os';
import { firstValueFrom, timeout } from 'rxjs';
import { ActivityRankingPersistenceModule } from '../../apps/activity-ranking-worker/src/infrastructure/activity-ranking-persistence.module';
import { ActivityRankingRepository } from '../../apps/activity-ranking-worker/src/activity-ranking.repository';
import {
  ACTIVITY_RANKING_KNEX,
  createActivityRankingKnex,
} from '../../apps/activity-ranking-worker/src/infrastructure/activity-ranking-knex';
import { migrateActivityRanking } from '../../apps/activity-ranking-worker/src/infrastructure/activity-ranking-migrations';
import { WeatherPersistenceModule } from '../../apps/weather-worker/src/infrastructure/weather-persistence.module';
import { WeatherApiQueryCacheRepository } from '../../apps/weather-worker/src/weather-api-query-cache.repository';
import {
  WEATHER_API_CACHE_COLLECTION,
  WeatherApiCacheDocument,
} from '../../apps/weather-worker/src/infrastructure/weather-mongo.providers';
import {
  WEATHER_CURRENT_QUERY,
  ACTIVITY_RANKINGS_QUERY,
} from '@libs/contracts/message-patterns';
import { parseLoadOptions, loadEnvironment } from './load-options';
import { measureOperations } from './load-metrics';
import { createLoadFixtures } from './load-fixtures';
import { startWorker, stopWorker, workerStats } from './worker-child';

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log(
      'Usage: pnpm load:workers --worker both|weather|activity-ranking --mode all|repository-write|worker-read --concurrency 1,10,50 --iterations 1000 --warmup 100 --dataset 1000 --payload-bytes 512 --pool 10 --runs 3 [--max-p95-ms 100]',
    );
    return;
  }
  config({ path: resolve('.env.load') });
  const options = parseLoadOptions(process.argv.slice(2));
  const environment = loadEnvironment(options.pool);
  Object.assign(process.env, environment);
  const services =
    options.worker === 'both'
      ? ['weather', 'activity-ranking']
      : [options.worker];
  const directory = resolve('.codex/load');
  await mkdir(directory, { recursive: true });
  const runId = randomUUID();
  const fixtures = createLoadFixtures(
    options.dataset,
    options.payloadBytes,
    runId,
  );
  const expiresAt = new Date(Date.now() + 86_400_000);
  const contexts = new Map<string, INestApplicationContext>();
  const children = new Map<string, ChildProcess>();
  const results: Array<{ passed: boolean; [key: string]: unknown }> = [];
  let weatherRepository: WeatherApiQueryCacheRepository;
  let rankingRepository: ActivityRankingRepository;
  let client: ClientProxy;
  try {
    if (services.includes('weather')) {
      const context = await NestFactory.createApplicationContext(
        WeatherPersistenceModule,
        { logger: false, abortOnError: false },
      );
      contexts.set('weather', context);
      weatherRepository = context.get(WeatherApiQueryCacheRepository);
      const seeded = await measureOperations(
        fixtures.length,
        options.pool,
        (index) => {
          const fixture = fixtures[index];
          return weatherRepository.save(
            fixture.request.signature,
            fixture.request.query,
            fixture.response,
            expiresAt,
          );
        },
      );
      if (seeded.errors) throw new Error('Weather fixture seeding failed');
    }
    if (services.includes('activity-ranking')) {
      const database = createActivityRankingKnex();
      try {
        await migrateActivityRanking(database);
      } finally {
        await database.destroy();
      }
      const context = await NestFactory.createApplicationContext(
        ActivityRankingPersistenceModule,
        { logger: false, abortOnError: false },
      );
      contexts.set('activity-ranking', context);
      rankingRepository = context.get(ActivityRankingRepository);
      for (let offset = 0; offset < fixtures.length; offset += 1000)
        await rankingRepository.saveRankings(
          fixtures
            .slice(offset, offset + 1000)
            .map((fixture) => fixture.ranking),
        );
    }
    if (options.mode !== 'repository-write') {
      for (const service of services)
        children.set(
          service,
          await startWorker(service, environment, directory),
        );
      client = ClientProxyFactory.create({
        transport: Transport.NATS,
        options: { servers: [environment.NATS_URL] },
      });
      await client.connect();
    }
    const modes =
      options.mode === 'all'
        ? ['repository-write', 'worker-read']
        : [options.mode];
    for (let run = 1; run <= options.runs; run++) {
      const orderedServices =
        run % 2 === 0 ? [...services].reverse() : services;
      for (const mode of modes)
        for (const concurrency of options.concurrency)
          for (const service of orderedServices) {
            const operation = async (index: number) => {
              const fixture = fixtures[index % fixtures.length];
              if (mode === 'repository-write') {
                if (service === 'weather')
                  await weatherRepository.save(
                    fixture.request.signature,
                    fixture.request.query,
                    fixture.response,
                    expiresAt,
                  );
                else
                  await rankingRepository.saveRankings([
                    { ...fixture.ranking, calculatedAt: new Date() },
                  ]);
              } else if (service === 'weather') {
                const value = await firstValueFrom(
                  client
                    .send(WEATHER_CURRENT_QUERY, fixture.coordinates)
                    .pipe(timeout(5000)),
                );
                if (
                  value.temperatureCelsius !== 14.5 ||
                  value.requestedCoordinates.latitude !==
                    fixture.coordinates.latitude ||
                  value.requestedCoordinates.longitude !==
                    fixture.coordinates.longitude
                )
                  throw new Error('Incorrect weather response');
              } else {
                const value = await firstValueFrom(
                  client
                    .send(ACTIVITY_RANKINGS_QUERY, {
                      city: fixture.ranking.city,
                      from: '2026-10-14',
                      until: '2026-10-15',
                    })
                    .pipe(timeout(5000)),
                );
                if (
                  value.length !== 1 ||
                  value[0].city !== fixture.ranking.city ||
                  value[0].score !== 70 ||
                  value[0].factors.benchmarkPayload.length !==
                    options.payloadBytes
                )
                  throw new Error('Incorrect ranking response');
              }
            };
            const warmup = await measureOperations(
              options.warmup,
              concurrency,
              operation,
            );
            if (warmup.errors)
              throw new Error(`Warmup failed for ${service}/${mode}`);
            const child = children.get(service);
            if (mode === 'worker-read') await workerStats(child, 'reset');
            const measured = await measureOperations(
              options.iterations,
              concurrency,
              operation,
            );
            const workerMetrics =
              mode === 'worker-read'
                ? await workerStats(child, 'snapshot')
                : null;
            const passed =
              measured.errors === 0 &&
              (options.maxP95Ms === null ||
                (measured.latencyMs.p95 !== null &&
                  measured.latencyMs.p95 <= options.maxP95Ms));
            results.push({
              service,
              mode,
              run,
              concurrency,
              passed,
              ...measured,
              workerMetrics,
            });
            console.log(
              `${service} ${mode} concurrency=${concurrency}: ${measured.successfulOperationsPerSecond.toFixed(1)} ops/s, p95=${measured.latencyMs.p95?.toFixed(2)} ms, errors=${measured.errors}`,
            );
          }
    }
    const report = {
      runId,
      recordedAt: new Date().toISOString(),
      options,
      environment: {
        node: process.version,
        platform: platform(),
        cpuModel: cpus()[0]?.model,
        logicalCpus: cpus().length,
        hostMemoryBytes: totalmem(),
        composeDefaults: {
          databaseCpuLimit: 1,
          databaseMemoryLimitBytes: 512 * 1024 * 1024,
        },
        mongodbWriteConcern: { w: 1, j: true },
        postgresSynchronousCommit: 'default/on',
        upstreamRequests: 'disabled',
      },
      fixtureBytes: {
        weather: Buffer.byteLength(JSON.stringify(fixtures[0].response)),
        ranking: Buffer.byteLength(JSON.stringify(fixtures[0].ranking)),
      },
      interpretation:
        'Closed-loop domain workloads. Repository writes and NATS worker reads are separate measurements. Schemas and returned payloads differ; these results do not isolate database-engine performance. Worker CPU/RSS exclude database containers and the load driver.',
      results,
    };
    await writeFile(
      join(directory, `results-${runId}.json`),
      JSON.stringify(report, null, 2),
    );
    console.log(`Report: .codex/load/results-${runId}.json`);
    if (results.some((result) => !result.passed)) process.exitCode = 1;
  } finally {
    client?.close();
    for (const child of children.values()) await stopWorker(child);
    try {
      for (let offset = 0; offset < fixtures.length; offset += 500) {
        const batch = fixtures.slice(offset, offset + 500);
        const weatherContext = contexts.get('weather');
        if (weatherContext)
          await weatherContext
            .get<Collection<WeatherApiCacheDocument>>(
              WEATHER_API_CACHE_COLLECTION,
            )
            .deleteMany({
              _id: { $in: batch.map((fixture) => fixture.request.signature) },
            });
        const rankingContext = contexts.get('activity-ranking');
        if (rankingContext)
          await rankingContext
            .get<Knex>(ACTIVITY_RANKING_KNEX)('activity_rankings')
            .whereIn(
              'city',
              batch.map((fixture) => fixture.ranking.city),
            )
            .delete();
      }
    } catch {
      console.error(
        'Fixture cleanup failed; review the isolated load databases',
      );
      process.exitCode = 1;
    } finally {
      const closed = await Promise.allSettled(
        [...contexts.values()].map((context) => context.close()),
      );
      if (closed.some((result) => result.status === 'rejected'))
        process.exitCode = 1;
    }
  }
}

void main().catch((error) => {
  console.error(
    `Load run failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
  );
  process.exitCode = 1;
});
