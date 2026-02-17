import { Field, InputType } from '@nestjs/graphql';

import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@InputType()
export class UpdateIngestionPipelineInputUpdates {
  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  name?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  description?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  mode?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  targetObjectNameSingular?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  sourceHttpMethod?: string;

  @IsOptional()
  @Field(() => GraphQLJSON, { nullable: true })
  sourceAuthConfig?: Record<string, unknown>;

  @IsOptional()
  @Field(() => GraphQLJSON, { nullable: true })
  sourceRequestConfig?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  responseRecordsPath?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  schedule?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  dedupFieldName?: string;

  @IsOptional()
  @Field(() => GraphQLJSON, { nullable: true })
  paginationConfig?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  @Field({ nullable: true })
  isEnabled?: boolean;
}

@InputType()
export class UpdateIngestionPipelineInput {
  @IsUUID()
  @IsNotEmpty()
  @Field(() => UUIDScalarType)
  id: string;

  @Type(() => UpdateIngestionPipelineInputUpdates)
  @ValidateNested()
  @Field(() => UpdateIngestionPipelineInputUpdates)
  update: UpdateIngestionPipelineInputUpdates;
}
