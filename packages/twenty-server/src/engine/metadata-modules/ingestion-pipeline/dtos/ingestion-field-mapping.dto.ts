import { Field, Int, ObjectType } from '@nestjs/graphql';

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

@ObjectType('IngestionFieldMapping')
export class IngestionFieldMappingDTO {
  @IsUUID()
  @IsNotEmpty()
  @Field(() => UUIDScalarType)
  id: string;

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
  @Field(() => String, { nullable: true })
  targetCompositeSubField: string | null;

  @IsOptional()
  @Field(() => GraphQLJSON, { nullable: true })
  transform: Record<string, unknown> | null;

  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  relationTargetObjectName: string | null;

  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  relationMatchFieldName: string | null;

  @IsBoolean()
  @Field()
  relationAutoCreate: boolean;

  @IsNumber()
  @Field(() => Int)
  position: number;
}
