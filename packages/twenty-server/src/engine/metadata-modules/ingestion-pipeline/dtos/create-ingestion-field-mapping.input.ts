import { Field, InputType, Int } from '@nestjs/graphql';

import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@InputType()
export class CreateIngestionFieldMappingInput {
  @IsUUID()
  @IsNotEmpty()
  @Field(() => UUIDScalarType)
  pipelineId: string;

  @IsString()
  @IsNotEmpty()
  @Field()
  sourceFieldPath: string;

  @IsString()
  @IsNotEmpty()
  @Field()
  targetFieldName: string;

  @IsString()
  @IsOptional()
  @Field({ nullable: true })
  targetCompositeSubField?: string;

  @IsOptional()
  @Field(() => GraphQLJSON, { nullable: true })
  transform?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  @Field({ nullable: true })
  relationTargetObjectName?: string;

  @IsString()
  @IsOptional()
  @Field({ nullable: true })
  relationMatchFieldName?: string;

  @IsBoolean()
  @IsOptional()
  @Field({ nullable: true })
  relationAutoCreate?: boolean;

  @IsNumber()
  @IsOptional()
  @Field(() => Int, { nullable: true })
  position?: number;
}
