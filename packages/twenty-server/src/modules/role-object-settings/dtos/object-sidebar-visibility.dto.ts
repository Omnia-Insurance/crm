import { Field, ObjectType } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';

@ObjectType('ObjectSidebarVisibility')
export class ObjectSidebarVisibilityDTO {
  @Field(() => UUIDScalarType)
  objectMetadataId: string;

  @Field(() => Boolean)
  showInSidebar: boolean;
}
