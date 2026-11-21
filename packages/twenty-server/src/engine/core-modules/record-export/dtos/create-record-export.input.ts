import { Field, InputType } from '@nestjs/graphql';

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsObject,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import GraphQLJSON from 'graphql-type-json';

import {
  type ObjectRecordFilter,
  type ObjectRecordOrderBy,
} from 'src/engine/api/graphql/workspace-query-builder/interfaces/object-record.interface';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { RecordExportRelationSubFieldInput } from 'src/engine/core-modules/record-export/dtos/record-export-relation-sub-field.input';

@InputType()
export class CreateRecordExportInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  objectMetadataId: string;

  @Field(() => [UUIDScalarType])
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  fieldMetadataIds: string[];

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  @IsObject()
  filter?: ObjectRecordFilter;

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  orderBy?: ObjectRecordOrderBy;

  // OMNIA-CUSTOM: relation sub-field columns such as "Lead / Date of Birth" (contract C6)
  @Field(() => [RecordExportRelationSubFieldInput], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RecordExportRelationSubFieldInput)
  relationSubFields?: RecordExportRelationSubFieldInput[];
}
