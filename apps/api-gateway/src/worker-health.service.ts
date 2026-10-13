import {
  GatewayTimeoutException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, TimeoutError, timeout } from 'rxjs';
import {
  ACTIVITY_RANKING_WORKER_CLIENT,
  ACTIVITY_RANKING_WORKER_HEALTH,
  WEATHER_WORKER_CLIENT,
  WEATHER_WORKER_HEALTH,
} from '../../../libs/contracts/src/message-patterns';
import { WorkerHealth } from '../../../libs/contracts/src/worker-health';

@Injectable()
export class WorkerHealthService {
  constructor(
    @Inject(WEATHER_WORKER_CLIENT)
    private readonly weatherWorkerClient: ClientProxy,
    @Inject(ACTIVITY_RANKING_WORKER_CLIENT)
    private readonly activityRankingWorkerClient: ClientProxy,
  ) {}

  getWorkersHealth(): Promise<WorkerHealth[]> {
    return Promise.all([
      this.request<WorkerHealth>(
        this.weatherWorkerClient,
        WEATHER_WORKER_HEALTH,
      ),
      this.request<WorkerHealth>(
        this.activityRankingWorkerClient,
        ACTIVITY_RANKING_WORKER_HEALTH,
      ),
    ]);
  }

  private async request<T>(client: ClientProxy, pattern: string): Promise<T> {
    try {
      return await firstValueFrom(
        client.send<T, Record<string, never>>(pattern, {}).pipe(timeout(3000)),
      );
    } catch (error) {
      if (error instanceof TimeoutError) {
        throw new GatewayTimeoutException('A domain worker did not respond');
      }

      throw new ServiceUnavailableException('A domain worker is unavailable');
    }
  }
}
