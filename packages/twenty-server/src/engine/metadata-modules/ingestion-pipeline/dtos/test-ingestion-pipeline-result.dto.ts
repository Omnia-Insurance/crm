import { Field, Int, ObjectType } from '@nestjs/graphql';

import { GraphQLJSON } from 'graphql-type-json';

@ObjectType('TestIngestionPipelineResult')
export class TestIngestionPipelineResultDTO {
  @Field()
  success: boolean;

  @Field(() => Int)
  totalRecords: number;

  @Field(() => Int)
  validRecords: number;

  @Field(() => Int)
  invalidRecords: number;

  @Field(() => [GraphQLJSON], { nullable: true })
  previewRecords: Record<string, unknown>[] | null;

  @Field(() => [GraphQLJSON], { nullable: true })
  errors: Record<string, unknown>[] | null;
}
