/* @license Enterprise */

import {
  FieldMetadataType,
  StandardObjectNameSingular,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { RelationType } from '~/generated-metadata/graphql';

type TargetWorkspaceMemberRelationFieldArgs = {
  relationFieldMetadataItem: FieldMetadataItem;
  objectMetadataItems: EnrichedObjectMetadataItem[];
};

const isManyToOneRelation = (fieldMetadataItem: FieldMetadataItem) =>
  fieldMetadataItem.type === FieldMetadataType.RELATION &&
  fieldMetadataItem.relation?.type === RelationType.MANY_TO_ONE;

// Contract C2: for policy.agent this is agentProfile.workspaceMember
export const findTargetWorkspaceMemberRelationField = ({
  relationFieldMetadataItem,
  objectMetadataItems,
}: TargetWorkspaceMemberRelationFieldArgs): FieldMetadataItem | undefined => {
  if (!isManyToOneRelation(relationFieldMetadataItem)) {
    return undefined;
  }

  const targetObjectMetadataItem = objectMetadataItems.find(
    (objectMetadataItem) =>
      objectMetadataItem.id ===
      relationFieldMetadataItem.relation?.targetObjectMetadata.id,
  );

  if (
    !isDefined(targetObjectMetadataItem) ||
    targetObjectMetadataItem.nameSingular ===
      StandardObjectNameSingular.WorkspaceMember
  ) {
    return undefined;
  }

  const workspaceMemberRelationFields = targetObjectMetadataItem.fields.filter(
    (fieldMetadataItem) =>
      isManyToOneRelation(fieldMetadataItem) &&
      fieldMetadataItem.relation?.targetObjectMetadata.nameSingular ===
        StandardObjectNameSingular.WorkspaceMember,
  );

  // agentProfile also points at workspaceMember through manager, so the name wins over
  // the count, as in the server's 2.58 permission translation and verify commands
  const workspaceMemberRelationField =
    workspaceMemberRelationFields.find(
      (fieldMetadataItem) => fieldMetadataItem.name === 'workspaceMember',
    ) ??
    (workspaceMemberRelationFields.length === 1
      ? workspaceMemberRelationFields[0]
      : undefined);

  return workspaceMemberRelationField?.isActive === true
    ? workspaceMemberRelationField
    : undefined;
};

export const hasRelationToWorkspaceMember = (
  args: TargetWorkspaceMemberRelationFieldArgs,
): boolean => isDefined(findTargetWorkspaceMemberRelationField(args));
