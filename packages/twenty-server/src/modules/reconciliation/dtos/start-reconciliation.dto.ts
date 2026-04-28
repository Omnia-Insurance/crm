import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType('StartReconciliationResult')
export class StartReconciliationResultDTO {
  @Field(() => Boolean)
  success: boolean;

  @Field(() => String)
  reconciliationId: string;

  @Field(() => String)
  status: string;
}
