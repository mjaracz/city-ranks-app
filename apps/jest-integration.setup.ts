import 'dotenv/config';

const defaults: Record<string, string> = {
  NATS_URL: 'nats://127.0.0.1:4222',
  WEATHER_MONGODB_URI:
    'mongodb://weather:weather-local-only@127.0.0.1:27017/?authSource=admin',
  WEATHER_MONGODB_DATABASE: 'weather',
  ACTIVITY_RANKING_DATABASE_URL:
    'postgresql://activity_ranking:ranking-local-only@127.0.0.1:5434/activity_ranking',
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}
