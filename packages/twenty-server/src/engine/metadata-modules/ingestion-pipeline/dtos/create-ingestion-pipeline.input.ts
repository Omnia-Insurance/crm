import { Field, InputType } from '@nestjs/graphql';

import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';

@InputType()
export class CreateIngestionPipelineInput {
  @IsString()
  @IsNotEmpty()
  @Field()
  name: string;

  @IsString()
  @IsOptional()
  @Field({ nullable: true })
  description?: string;

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
  @Field({ nullable: true })
  sourceUrl?: string;

  @IsString()
  @IsOptional()
  @Field({ nullable: true })
  sourceHttpMethod?: string;

  @IsOptional()
  @Field(() => GraphQLJSON, { nullable: true })
  sourceAuthConfig?: Record<string, unknown>;

  @IsOptional()
  @Field(() => GraphQLJSON, { nullable: true })
  sourceRequestConfig?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  @Field({ nullable: true })
  responseRecordsPath?: string;

  @IsString()
  @IsOptional()
  @Field({ nullable: true })
  schedule?: string;

  @IsString()
  @IsOptional()
  @Field({ nullable: true })
  dedupFieldName?: string;

  @IsOptional()
  @Field(() => GraphQLJSON, { nullable: true })
  paginationConfig?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  @Field({ nullable: true })
  isEnabled?: boolean;
}
