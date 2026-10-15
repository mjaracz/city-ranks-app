import { Field, ObjectType } from '@nestjs/graphql';
import type { CommandReceipt } from '../../../../../libs/contracts/src/domain-command';

@ObjectType()
export class CommandReceiptType implements CommandReceipt {
  @Field(() => String)
  commandId!: string;

  @Field(() => String)
  domain!: string;

  @Field(() => Boolean)
  accepted!: boolean;
}
