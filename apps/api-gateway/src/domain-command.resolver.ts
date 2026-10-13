import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { CommandReceiptType } from './command-receipt.type';
import { DomainCommandService } from './domain-command.service';

@Resolver()
export class DomainCommandResolver {
  constructor(private readonly commandService: DomainCommandService) {}

  @Mutation(() => CommandReceiptType)
  requestWeatherRefresh(
    @Args('city', { type: () => String }) city: string,
  ): Promise<CommandReceiptType> {
    return this.commandService.requestWeatherRefresh(city);
  }

  @Mutation(() => CommandReceiptType)
  requestActivityRanking(
    @Args('city', { type: () => String }) city: string,
  ): Promise<CommandReceiptType> {
    return this.commandService.requestActivityRanking(city);
  }
}
