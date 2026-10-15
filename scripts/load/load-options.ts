import { getPositiveInteger } from '@libs/config/environment';

export interface LoadOptions {
  worker: 'both' | 'weather' | 'activity-ranking';
  mode: 'all' | 'repository-write' | 'worker-read';
  iterations: number;
  warmup: number;
  dataset: number;
  payloadBytes: number;
  concurrency: number[];
  runs: number;
  pool: number;
  maxP95Ms: number | null;
}

export function parseLoadOptions(args: string[]): LoadOptions {
  const options: Record<string, string> = {};
  const allowed = new Set([
    'worker',
    'mode',
    'iterations',
    'warmup',
    'dataset',
    'payload-bytes',
    'concurrency',
    'runs',
    'pool',
    'max-p95-ms',
  ]);
  for (let index = 0; index < args.length; index++) {
    const [name, inline] = args[index].split('=');
    if (!name.startsWith('--') || !allowed.has(name.slice(2)))
      throw new Error(`Unknown option: ${name}`);
    const value = inline ?? args[++index];
    if (!value || value.startsWith('--'))
      throw new Error(`Missing value: ${name}`);
    options[name.slice(2)] = value;
  }
  const integer = (key: string, fallback: number, maximum: number) => {
    const value = getPositiveInteger(key, fallback, options);
    if (value > maximum) throw new RangeError(`${key} exceeds ${maximum}`);
    return value;
  };
  const worker = options.worker ?? 'both';
  const mode = options.mode ?? 'all';
  if (
    !['both', 'weather', 'activity-ranking'].includes(worker) ||
    !['all', 'repository-write', 'worker-read'].includes(mode)
  )
    throw new Error('Invalid worker or mode');
  const concurrency = (options.concurrency ?? '1,10,50')
    .split(',')
    .map((value) => Number(value));
  if (
    concurrency.some(
      (value) => !Number.isSafeInteger(value) || value < 1 || value > 1000,
    )
  )
    throw new RangeError('Concurrency must contain integers from 1 to 1000');
  const maxP95Ms =
    options['max-p95-ms'] === undefined ? null : Number(options['max-p95-ms']);
  if (maxP95Ms !== null && (!Number.isFinite(maxP95Ms) || maxP95Ms <= 0))
    throw new RangeError('max-p95-ms must be positive');
  return {
    worker: worker as LoadOptions['worker'],
    mode: mode as LoadOptions['mode'],
    iterations: integer('iterations', 1000, 1_000_000),
    warmup: integer('warmup', 100, 100_000),
    dataset: integer('dataset', 1000, 100_000),
    payloadBytes: integer('payload-bytes', 512, 100_000),
    concurrency: [...new Set(concurrency)],
    runs: integer('runs', 1, 20),
    pool: integer('pool', 10, 100),
    maxP95Ms,
  };
}

export function loadEnvironment(pool: number): NodeJS.ProcessEnv {
  const environment = {
    ...process.env,
    NODE_ENV: 'test',
    NATS_URL: process.env.LOAD_NATS_URL ?? 'nats://127.0.0.1:4223',
    WEATHER_MONGODB_URI:
      process.env.LOAD_WEATHER_MONGODB_URI ??
      'mongodb://weather_load:weather-load-local-only@127.0.0.1:27018/?authSource=admin',
    WEATHER_MONGODB_DATABASE:
      process.env.LOAD_WEATHER_MONGODB_DATABASE ?? 'weather_load',
    ACTIVITY_RANKING_DATABASE_URL:
      process.env.LOAD_ACTIVITY_RANKING_DATABASE_URL ??
      'postgresql://ranking_load:ranking-load-local-only@127.0.0.1:5435/activity_ranking_load',
    WEATHER_DB_POOL_MAX: String(pool),
    ACTIVITY_RANKING_DB_POOL_MAX: String(pool),
    OPEN_METEO_FORECAST_API_URL: 'https://load-fixture.invalid/v1/forecast',
    OPEN_METEO_API_KEY: '',
    WEATHER_API_CACHE_ONLY: 'true',
    WEATHER_API_CACHE_TTL_MS: '86400000',
  };
  for (const key of [
    'NATS_URL',
    'WEATHER_MONGODB_URI',
    'ACTIVITY_RANKING_DATABASE_URL',
  ]) {
    const url = new URL(environment[key]);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
      throw new Error('Load targets must use loopback hosts');
  }
  if (
    !environment.WEATHER_MONGODB_DATABASE.endsWith('_load') ||
    !new URL(environment.ACTIVITY_RANKING_DATABASE_URL).pathname.endsWith(
      '_load',
    )
  ) {
    throw new Error('Load databases must use names ending with _load');
  }
  return environment;
}
