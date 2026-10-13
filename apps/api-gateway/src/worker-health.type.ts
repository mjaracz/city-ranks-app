import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class WorkerHealthType {
  @Field(() => String)
  service!: string;

  @Field(() => Boolean)
  ready!: boolean;

  @Field(() => String)
  database!: string;

  @Field(() => String)
  eventStore!: string;

  @Field(() => String)
  commandConsumer!: string;
}
