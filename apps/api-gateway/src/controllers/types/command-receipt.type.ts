import type { CommandReceipt } from '@libs/contracts/domain-command';

import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class CommandReceiptType implements CommandReceipt {
  @Field(() => String)
  commandId!: string;

  @Field(() => String)
  domain!: string;

  @Field(() => Boolean)
  accepted!: boolean;
}
