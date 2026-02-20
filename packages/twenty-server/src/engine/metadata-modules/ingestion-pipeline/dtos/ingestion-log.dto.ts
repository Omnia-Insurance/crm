import { Field, Int, ObjectType } from '@nestjs/graphql';

import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ObjectType('IngestionLog')
export class IngestionLogDTO {
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
  status: string;

  @IsString()
  @IsNotEmpty()
  @Field()
  triggerType: string;

  @IsNumber()
  @Field(() => Int)
  totalRecordsReceived: number;

  @IsNumber()
  @Field(() => Int)
  recordsCreated: number;

  @IsNumber()
  @Field(() => Int)
  recordsUpdated: number;

  @IsNumber()
  @Field(() => Int)
  recordsSkipped: number;

  @IsNumber()
  @Field(() => Int)
  recordsFailed: number;

  @IsOptional()
  @Field(() => GraphQLJSON, { nullable: true })
  errors: Record<string, unknown>[] | null;

  @IsOptional()
  @Field(() => GraphQLJSON, { nullable: true })
  incomingPayload: Record<string, unknown>[] | null;

  @IsDateString()
  @IsOptional()
  @Field(() => Date, { nullable: true })
  startedAt: Date | null;

  @IsDateString()
  @IsOptional()
  @Field(() => Date, { nullable: true })
  completedAt: Date | null;

  @IsNumber()
  @IsOptional()
  @Field(() => Int, { nullable: true })
  durationMs: number | null;
}
