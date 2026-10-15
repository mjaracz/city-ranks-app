import { Query, Resolver } from '@nestjs/graphql';

import { WorkerHealthService } from '../../services/worker-health.service';
import { WorkerHealthType } from '../types/worker-health.type';

@Resolver(() => WorkerHealthType)
export class WorkerHealthResolver {
  constructor(private readonly workerHealthService: WorkerHealthService) {}

  @Query(() => [WorkerHealthType])
  workersHealth(): Promise<WorkerHealthType[]> {
    return this.workerHealthService.getWorkersHealth();
  }
}
