import { Args, Mutation, Resolver } from '@nestjs/graphql';

import { DomainCommandService } from '../../services/domain-command.service';
import { CommandReceiptType } from '../types/command-receipt.type';

@Resolver()
export class DomainCommandResolver {
  constructor(private readonly commandService: DomainCommandService) {}

  @Mutation(() => CommandReceiptType)
  requestActivityRanking(
    @Args('city', { type: () => String }) city: string,
  ): Promise<CommandReceiptType> {
    return this.commandService.requestActivityRanking(city);
  }
}
