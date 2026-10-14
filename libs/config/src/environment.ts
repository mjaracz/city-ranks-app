export function getNatsUrl(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const natsUrl = environment.NATS_URL;

  if (!natsUrl && environment.NODE_ENV === 'production') {
    throw new Error('NATS_URL must be set in production');
  }

  const configuredUrl = natsUrl ?? 'nats://127.0.0.1:4222';
  const parsedUrl = new URL(configuredUrl);

  if (!['nats:', 'tls:'].includes(parsedUrl.protocol)) {
    throw new Error('NATS_URL must use the nats: or tls: protocol');
  }

  return configuredUrl;
}

export function getApiGatewayPort(
  environment: NodeJS.ProcessEnv = process.env,
): number {
  const port = Number(environment.API_GATEWAY_PORT ?? 3000);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('API_GATEWAY_PORT must be a valid TCP port');
  }

  return port;
}

export function getRequiredDatabaseUrl(
  key: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const databaseUrl = environment[key];

  if (!databaseUrl) {
    throw new Error(`${key} must be set`);
  }

  const parsedUrl = new URL(databaseUrl);

  if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) {
    throw new Error(`${key} must use a PostgreSQL URL`);
  }

  return databaseUrl;
}

export function isProduction(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.NODE_ENV === 'production';
}

export function getPositiveInteger(
  key: string,
  fallback: number,
  environment: NodeJS.ProcessEnv = process.env,
): number {
  const value =
    environment[key] === undefined ? fallback : Number(environment[key]);
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`${key} must be a positive integer`);
  return value;
}

export function getWeatherMongoConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): { uri: string; database: string } {
  const uri = environment.WEATHER_MONGODB_URI?.trim();
  const database = environment.WEATHER_MONGODB_DATABASE?.trim();
  if (!uri || !/^mongodb(?:\+srv)?:\/\//.test(uri))
    throw new Error('WEATHER_MONGODB_URI must be a MongoDB URI');
  if (!database || /[\/\\.\s"$*<>:|?]/.test(database))
    throw new Error('WEATHER_MONGODB_DATABASE must be a valid database name');
  return { uri, database };
}
