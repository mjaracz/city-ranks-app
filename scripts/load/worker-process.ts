import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

import { getNatsUrl } from '@libs/config/environment';
import {
  ACTIVITY_RANKING_WORKER_QUEUE,
  WEATHER_WORKER_QUEUE,
} from '@libs/contracts/message-patterns';

import { ActivityRankingWorkerModule } from '../../apps/activity-ranking-worker/src/activity-ranking-worker.module';
import { WeatherWorkerModule } from '../../apps/weather-worker/src/weather-worker.module';

async function main(): Promise<void> {
  const weather = process.argv[2] === 'weather';
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    weather ? WeatherWorkerModule : ActivityRankingWorkerModule,
    {
      logger: false,
      abortOnError: false,
      transport: Transport.NATS,
      options: {
        servers: [getNatsUrl()],
        queue: weather ? WEATHER_WORKER_QUEUE : ACTIVITY_RANKING_WORKER_QUEUE,
      },
    },
  );
  await app.listen();
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  let cpu = process.cpuUsage();
  let utilization = performance.eventLoopUtilization();
  process.on('message', (message: { kind: string; requestId: number }) => {
    if (message.kind === 'reset') {
      cpu = process.cpuUsage();
      utilization = performance.eventLoopUtilization();
      histogram.reset();
      process.send?.({ kind: 'stats', requestId: message.requestId });
    } else if (message.kind === 'snapshot') {
      process.send?.({
        kind: 'stats',
        requestId: message.requestId,
        metrics: {
          cpuMicroseconds: process.cpuUsage(cpu),
          rssBytes: process.memoryUsage().rss,
          eventLoopUtilization:
            performance.eventLoopUtilization(utilization).utilization,
          eventLoopDelayP99Ms: histogram.percentile(99) / 1e6,
        },
      });
    } else if (message.kind === 'shutdown') {
      histogram.disable();
      void app
        .close()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
    }
  });
  process.send?.({ kind: 'ready' });
}

void main().catch(() => {
  process.send?.({ kind: 'fatal' });
  process.exitCode = 1;
  process.disconnect?.();
});
