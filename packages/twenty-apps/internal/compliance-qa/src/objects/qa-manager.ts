import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  QA_MANAGERS_ON_WORKSPACE_MEMBER_FIELD_ID,
  QA_MANAGER_OBJECT_UNIVERSAL_IDENTIFIER,
  QA_MANAGER_FIELD_ID,
  QA_MANAGER_WORKSPACE_MEMBER_FIELD_ID,
  QA_SCORECARD_OBJECT_UNIVERSAL_IDENTIFIER,
  QA_SCORECARDS_ON_QA_MANAGER_FIELD_ID,
} from 'src/constants/universal-identifiers';

export { QA_MANAGER_OBJECT_UNIVERSAL_IDENTIFIER };

export const QA_MANAGER_NAME_FIELD_ID =
  '0f3c16ec-1244-4757-b319-8140f234911b';
export { QA_MANAGER_WORKSPACE_MEMBER_FIELD_ID };
export const QA_MANAGER_IS_ACTIVE_FIELD_ID =
  '2fe5a6b1-b0dd-4606-84c4-37499d947456';
export const QA_MANAGER_ASSIGNMENT_ORDER_FIELD_ID =
  'c28ea4a6-c653-4b14-ab73-c85ebe867664';
export const QA_MANAGER_LAST_ASSIGNED_AT_FIELD_ID =
  '2447f1c7-43b0-4110-981f-5b23269d854b';
export { QA_SCORECARDS_ON_QA_MANAGER_FIELD_ID };

export default defineObject({
  universalIdentifier: QA_MANAGER_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'qaManager',
  namePlural: 'qaManagers',
  labelSingular: 'QA Manager',
  labelPlural: 'QA Managers',
  description:
    'Workspace members eligible to receive Compliance QA follow-up tasks.',
  icon: 'IconUserCheck',
  labelIdentifierFieldMetadataUniversalIdentifier: QA_MANAGER_NAME_FIELD_ID,
  fields: [
    {
      universalIdentifier: QA_MANAGER_NAME_FIELD_ID,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      description:
        'Display label for this QA manager assignment, usually the workspace member name.',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: QA_MANAGER_WORKSPACE_MEMBER_FIELD_ID,
      type: FieldType.RELATION,
      name: 'workspaceMember',
      label: 'Workspace Member',
      description: 'Workspace member who can receive QA follow-up tasks.',
      icon: 'IconUser',
      relationTargetObjectMetadataUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.workspaceMember
          .universalIdentifier,
      relationTargetFieldMetadataUniversalIdentifier:
        QA_MANAGERS_ON_WORKSPACE_MEMBER_FIELD_ID,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'workspaceMemberId',
      },
    },
    {
      universalIdentifier: QA_MANAGER_IS_ACTIVE_FIELD_ID,
      type: FieldType.BOOLEAN,
      name: 'isActive',
      label: 'Active',
      description: 'Only active QA managers receive new follow-up tasks.',
      icon: 'IconCircleCheck',
      defaultValue: true,
    },
    {
      universalIdentifier: QA_MANAGER_ASSIGNMENT_ORDER_FIELD_ID,
      type: FieldType.NUMBER,
      name: 'assignmentOrder',
      label: 'Assignment Order',
      description:
        'Lower numbers are preferred when selecting the next QA manager.',
      icon: 'IconSortAscending',
      defaultValue: 0,
    },
    {
      universalIdentifier: QA_MANAGER_LAST_ASSIGNED_AT_FIELD_ID,
      type: FieldType.DATE_TIME,
      name: 'lastAssignedAt',
      label: 'Last Assigned At',
      description: 'When this QA manager last received a follow-up task.',
      icon: 'IconCalendarCheck',
    },
    {
      universalIdentifier: QA_SCORECARDS_ON_QA_MANAGER_FIELD_ID,
      type: FieldType.RELATION,
      name: 'scorecards',
      label: 'QA Scorecards',
      description: 'Compliance QA scorecards assigned to this QA manager.',
      icon: 'IconClipboardCheck',
      relationTargetObjectMetadataUniversalIdentifier:
        QA_SCORECARD_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier: QA_MANAGER_FIELD_ID,
      universalSettings: {
        relationType: RelationType.ONE_TO_MANY,
      },
    },
  ],
});
