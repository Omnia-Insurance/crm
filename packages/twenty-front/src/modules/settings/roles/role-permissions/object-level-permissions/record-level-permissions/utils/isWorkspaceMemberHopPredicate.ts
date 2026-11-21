/* @license Enterprise */

import { isDefined } from 'twenty-shared/utils';

import {
  findWorkspaceMemberHop,
  type WorkspaceMemberHopMetadata,
} from '@/settings/roles/role-permissions/object-level-permissions/record-level-permissions/utils/findWorkspaceMemberHop';
import { type RowLevelPermissionPredicate } from '~/generated-metadata/graphql';

// Matches exactly the hops the builder writes, whatever the operand, so initialization and
// draft sync agree on which hops it owns; every other hop stays hidden and untouched
export const isWorkspaceMemberHopPredicate = ({
  predicate,
  ...workspaceMemberHopMetadata
}: WorkspaceMemberHopMetadata & {
  predicate: RowLevelPermissionPredicate;
}): boolean => {
  if (
    !isDefined(predicate.relationFieldMetadataId) ||
    isDefined(predicate.value) ||
    isDefined(predicate.subFieldName) ||
    isDefined(predicate.workspaceMemberSubFieldName)
  ) {
    return false;
  }

  return (
    findWorkspaceMemberHop({
      relationFieldMetadataId: predicate.relationFieldMetadataId,
      workspaceMemberFieldMetadataId: predicate.workspaceMemberFieldMetadataId,
      ...workspaceMemberHopMetadata,
    })?.fieldMetadataId === predicate.fieldMetadataId
  );
};
