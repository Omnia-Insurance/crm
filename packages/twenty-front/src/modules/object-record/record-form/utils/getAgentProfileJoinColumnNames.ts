import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { getFieldMetadataItemGqlFieldName } from '@/object-metadata/utils/getFieldMetadataItemGqlFieldName';
import { isManyToOneRelationField } from '@/object-metadata/utils/isManyToOneRelationField';
import { AGENT_PROFILE_OBJECT_NAME_SINGULAR } from '@/object-record/record-form/constants/AgentProfileObjectNameSingular';

// The prefill names the record's own agent: with several AgentProfile relations
// (call.agent and call.managing, its QA manager) only the one named agent qualifies
const OWNER_AGENT_PROFILE_RELATION_FIELD_NAME = 'agent';

export const getAgentProfileJoinColumnNames = (
  fieldMetadataItems: FieldMetadataItem[],
): string[] => {
  const agentProfileRelationFieldMetadataItems = fieldMetadataItems.filter(
    (fieldMetadataItem) =>
      fieldMetadataItem.isActive === true &&
      isManyToOneRelationField(fieldMetadataItem) &&
      fieldMetadataItem.relation.targetObjectMetadata.nameSingular ===
        AGENT_PROFILE_OBJECT_NAME_SINGULAR,
  );

  const ownerAgentProfileRelationFieldMetadataItems =
    agentProfileRelationFieldMetadataItems.length > 1
      ? agentProfileRelationFieldMetadataItems.filter(
          (fieldMetadataItem) =>
            fieldMetadataItem.name === OWNER_AGENT_PROFILE_RELATION_FIELD_NAME,
        )
      : agentProfileRelationFieldMetadataItems;

  return ownerAgentProfileRelationFieldMetadataItems.map((fieldMetadataItem) =>
    getFieldMetadataItemGqlFieldName(fieldMetadataItem),
  );
};
