import { Field, InputType, Int } from '@nestjs/graphql';

import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@InputType()
export class UpdateIngestionFieldMappingInputUpdates {
  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  sourceFieldPath?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  targetFieldName?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  targetCompositeSubField?: string;

  @IsOptional()
  @Field(() => GraphQLJSON, { nullable: true })
  transform?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  relationTargetObjectName?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  relationMatchFieldName?: string;

  @IsOptional()
  @IsBoolean()
  @Field({ nullable: true })
  relationAutoCreate?: boolean;

  @IsOptional()
  @IsNumber()
  @Field(() => Int, { nullable: true })
  position?: number;
}

@InputType()
export class UpdateIngestionFieldMappingInput {
  @IsUUID()
  @IsNotEmpty()
  @Field(() => UUIDScalarType)
  id: string;

  @Type(() => UpdateIngestionFieldMappingInputUpdates)
  @ValidateNested()
  @Field(() => UpdateIngestionFieldMappingInputUpdates)
  update: UpdateIngestionFieldMappingInputUpdates;
}
