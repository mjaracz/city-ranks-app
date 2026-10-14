import { performance } from 'node:perf_hooks';

export function percentile(
  sorted: readonly number[],
  percentage: number,
): number | null {
  return sorted.length === 0
    ? null
    : sorted[Math.max(0, Math.ceil((sorted.length * percentage) / 100) - 1)];
}

export async function measureOperations(
  iterations: number,
  concurrency: number,
  operation: (index: number) => Promise<void>,
) {
  const latencies: number[] = [];
  let next = 0;
  let errors = 0;
  const failures = new Set<string>();
  const start = performance.now();
  await Promise.all(
    Array.from({ length: Math.min(iterations, concurrency) }, async () => {
      while (next < iterations) {
        const index = next++;
        const operationStart = performance.now();
        try {
          await operation(index);
          latencies.push(performance.now() - operationStart);
        } catch (error) {
          errors++;
          if (failures.size < 5)
            failures.add(error instanceof Error ? error.name : 'RequestError');
        }
      }
    }),
  );
  const elapsedMs = performance.now() - start;
  latencies.sort((a, b) => a - b);
  return {
    attempted: iterations,
    succeeded: latencies.length,
    errors,
    errorRate: errors / iterations,
    elapsedMs,
    successfulOperationsPerSecond: latencies.length / (elapsedMs / 1000),
    latencyMs: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      max: latencies[latencies.length - 1] ?? null,
    },
    failureTypes: [...failures],
  };
}
