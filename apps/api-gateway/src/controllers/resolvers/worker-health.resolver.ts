import { Query, Resolver } from '@nestjs/graphql';
import { WorkerHealthType } from '../types/worker-health.type';
import { WorkerHealthService } from '../../services/worker-health.service';

@Resolver(() => WorkerHealthType)
export class WorkerHealthResolver {
  constructor(private readonly workerHealthService: WorkerHealthService) {}

  @Query(() => [WorkerHealthType])
  workersHealth(): Promise<WorkerHealthType[]> {
    return this.workerHealthService.getWorkersHealth();
  }
}
