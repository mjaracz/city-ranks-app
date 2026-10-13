import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class CommandReceiptType {
  @Field(() => String)
  commandId!: string;

  @Field(() => String)
  domain!: string;

  @Field(() => Boolean)
  accepted!: boolean;
}
