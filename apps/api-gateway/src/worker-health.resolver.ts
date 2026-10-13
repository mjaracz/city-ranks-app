import { Query, Resolver } from '@nestjs/graphql';
import { WorkerHealthType } from './worker-health.type';
import { WorkerHealthService } from './worker-health.service';

@Resolver(() => WorkerHealthType)
export class WorkerHealthResolver {
  constructor(private readonly workerHealthService: WorkerHealthService) {}

  @Query(() => [WorkerHealthType])
  workersHealth(): Promise<WorkerHealthType[]> {
    return this.workerHealthService.getWorkersHealth();
  }
}
