import { Field, InputType } from '@nestjs/graphql';

import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { IDENTIFIER_MAX_CHAR_LENGTH } from 'twenty-shared/metadata';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@InputType()
export class RecordExportRelationSubFieldInput {
  @Field(() => UUIDScalarType)
  @IsUUID()
  fieldMetadataId: string;

  @Field(() => String)
  @IsString()
  @IsNotEmpty()
  @MaxLength(IDENTIFIER_MAX_CHAR_LENGTH)
  subFieldName: string;
}
