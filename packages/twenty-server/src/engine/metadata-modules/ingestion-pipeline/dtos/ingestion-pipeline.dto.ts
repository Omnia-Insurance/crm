import { Field, HideField, ObjectType } from '@nestjs/graphql';

import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ObjectType('IngestionPipeline')
export class IngestionPipelineDTO {
  @IsUUID()
  @IsNotEmpty()
  @Field(() => UUIDScalarType)
  id: string;

  @IsString()
  @IsNotEmpty()
  @Field()
  name: string;

  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  description: string | null;

  @IsString()
  @IsNotEmpty()
  @Field()
  mode: string;

  @IsString()
  @IsNotEmpty()
  @Field()
  targetObjectNameSingular: string;

  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  webhookSecret: string | null;

  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  sourceUrl: string | null;

  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  sourceHttpMethod: string | null;

  @IsOptional()
  @Field(() => GraphQLJSON, { nullable: true })
  sourceAuthConfig: Record<string, unknown> | null;

  @IsOptional()
  @Field(() => GraphQLJSON, { nullable: true })
  sourceRequestConfig: Record<string, unknown> | null;

  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  responseRecordsPath: string | null;

  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  schedule: string | null;

  @IsString()
  @IsOptional()
  @Field(() => String, { nullable: true })
  dedupFieldName: string | null;

  @IsOptional()
  @Field(() => GraphQLJSON, { nullable: true })
  paginationConfig: Record<string, unknown> | null;

  @IsBoolean()
  @Field()
  isEnabled: boolean;

  @HideField()
  workspaceId: string;

  @IsDateString()
  @Field()
  createdAt: Date;

  @IsDateString()
  @Field()
  updatedAt: Date;

  @IsDateString()
  @IsOptional()
  @Field(() => Date, { nullable: true })
  deletedAt: Date | null;
}
