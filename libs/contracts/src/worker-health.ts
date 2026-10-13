export interface WorkerHealth {
  service: string;
  ready: boolean;
  database: 'available' | 'unavailable';
  eventStore: 'available' | 'unavailable';
  commandConsumer: 'available' | 'unavailable';
}
