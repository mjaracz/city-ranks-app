import { Args, Float, Mutation, Resolver } from '@nestjs/graphql';
import { CommandReceiptType } from '../types/command-receipt.type';
import { DomainCommandService } from '../../services/domain-command.service';

@Resolver()
export class DomainCommandResolver {
  constructor(private readonly commandService: DomainCommandService) {}

  @Mutation(() => CommandReceiptType)
  requestWeatherRefresh(
    @Args('city', { type: () => String }) city: string,
    @Args('latitude', { type: () => Float, nullable: true }) latitude?: number,
    @Args('longitude', { type: () => Float, nullable: true })
    longitude?: number,
  ): Promise<CommandReceiptType> {
    return this.commandService.requestWeatherRefresh(city, latitude, longitude);
  }

  @Mutation(() => CommandReceiptType)
  requestActivityRanking(
    @Args('city', { type: () => String }) city: string,
  ): Promise<CommandReceiptType> {
    return this.commandService.requestActivityRanking(city);
  }
}
