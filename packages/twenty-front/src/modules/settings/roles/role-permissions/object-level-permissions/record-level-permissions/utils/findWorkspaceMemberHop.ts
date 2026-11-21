/* @license Enterprise */

import { isDefined } from 'twenty-shared/utils';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { findTargetWorkspaceMemberRelationField } from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/hasRelationToWorkspaceMember';

export type WorkspaceMemberHop = {
  relationFieldMetadataId: string;
  fieldMetadataId: string;
  workspaceMemberFieldMetadataId: string;
};

export type WorkspaceMemberHopMetadata = {
  fieldMetadataItems: FieldMetadataItem[];
  objectMetadataItems: EnrichedObjectMetadataItem[];
  workspaceMemberIdFieldMetadataId: string | undefined;
};

// "Me" on a relation to a member-owned record compares that record's member relation
// with workspaceMember.id (contract C2); comparing the relation itself would match nothing
export const findWorkspaceMemberHop = ({
  relationFieldMetadataId,
  workspaceMemberFieldMetadataId,
  fieldMetadataItems,
  objectMetadataItems,
  workspaceMemberIdFieldMetadataId,
}: WorkspaceMemberHopMetadata & {
  relationFieldMetadataId: string;
  workspaceMemberFieldMetadataId: string | null | undefined;
}): WorkspaceMemberHop | undefined => {
  if (
    !isDefined(workspaceMemberIdFieldMetadataId) ||
    workspaceMemberFieldMetadataId !== workspaceMemberIdFieldMetadataId
  ) {
    return undefined;
  }

  const relationFieldMetadataItem = fieldMetadataItems.find(
    (fieldMetadataItem) => fieldMetadataItem.id === relationFieldMetadataId,
  );

  const targetWorkspaceMemberRelationField = isDefined(
    relationFieldMetadataItem,
  )
    ? findTargetWorkspaceMemberRelationField({
        relationFieldMetadataItem,
        objectMetadataItems,
      })
    : undefined;

  if (!isDefined(targetWorkspaceMemberRelationField)) {
    return undefined;
  }

  return {
    relationFieldMetadataId,
    fieldMetadataId: targetWorkspaceMemberRelationField.id,
    workspaceMemberFieldMetadataId: workspaceMemberIdFieldMetadataId,
  };
};
