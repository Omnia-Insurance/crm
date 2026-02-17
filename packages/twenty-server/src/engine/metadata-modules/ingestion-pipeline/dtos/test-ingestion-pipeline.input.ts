import { Field, InputType } from '@nestjs/graphql';

import { IsArray, IsNotEmpty } from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@InputType()
export class TestIngestionPipelineInput {
  @IsNotEmpty()
  @Field(() => UUIDScalarType)
  pipelineId: string;

  @IsArray()
  @Field(() => [GraphQLJSON])
  sampleRecords: Record<string, unknown>[];
}
