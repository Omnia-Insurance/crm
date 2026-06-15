import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  AGENT_FIELD_ID,
  AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
  FOLLOW_UP_TASK_FIELD_ID,
  LEAD_FIELD_ID,
  QA_MANAGER_FIELD_ID,
  QA_MANAGER_OBJECT_UNIVERSAL_IDENTIFIER,
  QA_SCORECARD_OBJECT_UNIVERSAL_IDENTIFIER,
  QA_SCORECARDS_ON_AGENT_FIELD_ID,
  QA_SCORECARDS_ON_CALL_FIELD_ID,
  QA_SCORECARDS_ON_LEAD_FIELD_ID,
  QA_SCORECARDS_ON_QA_MANAGER_FIELD_ID,
  QA_SCORECARDS_ON_TASK_FIELD_ID,
  SOURCE_CALL_FIELD_ID,
  SOURCE_CALL_KEY_FIELD_ID,
  CALL_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

export {
  AGENT_FIELD_ID,
  FOLLOW_UP_TASK_FIELD_ID,
  LEAD_FIELD_ID,
  QA_MANAGER_FIELD_ID,
  QA_SCORECARD_OBJECT_UNIVERSAL_IDENTIFIER,
  SOURCE_CALL_FIELD_ID,
  SOURCE_CALL_KEY_FIELD_ID,
};

export const NAME_FIELD_ID = 'b4f6d8c2-9e57-4a3b-af2d-6c4e8b0a2f13';
export const PROCESSING_STARTED_AT_FIELD_ID =
  '42797c54-ee8f-4205-8cbe-ad8de50f3a35';
export const ANALYZED_AT_FIELD_ID = 'ba569a0d-75f3-4c31-b442-e02c2bcd53ec';
export const SCORE_FIELD_ID = 'c5a7e9d3-0f68-4b4c-ba3e-7d5f9c1b3a24';
export const RESULT_FIELD_ID = '4dca7ef6-ff56-49a8-9965-fddf0da94b24';
export const TYPE_FIELD_ID = '0dcd9235-1658-4e73-be5b-1a8df13ab4d4';
export const RED_FLAG_FIELD_ID = '631ba702-2f06-41a3-b234-388c684b0770';
export const STATUS_FIELD_ID = '42b314a1-34ce-4862-9efb-0ff8b28942bf';
export const REASON_FIELD_ID = 'd2c4e6a8-1b3d-4f5a-9c7e-0a2b4d6f8c1e';

export default defineObject({
  universalIdentifier: QA_SCORECARD_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'qaScorecard',
  namePlural: 'qaScorecards',
  labelSingular: 'QA Scorecard',
  labelPlural: 'QA Scorecards',
  description: 'Automated compliance QA scorecard for insurance sales calls.',
  icon: 'IconClipboardCheck',
  labelIdentifierFieldMetadataUniversalIdentifier: NAME_FIELD_ID,
  fields: [
    {
      universalIdentifier: NAME_FIELD_ID,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      description: 'Display name for this QA scorecard.',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: SOURCE_CALL_FIELD_ID,
      type: FieldType.RELATION,
      name: 'call',
      label: 'Source Call',
      description: 'Call that this QA scorecard evaluates.',
      icon: 'IconPhoneCall',
      relationTargetObjectMetadataUniversalIdentifier:
        CALL_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        QA_SCORECARDS_ON_CALL_FIELD_ID,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'callId',
      },
    },
    {
      universalIdentifier: SOURCE_CALL_KEY_FIELD_ID,
      type: FieldType.TEXT,
      name: 'sourceCallKey',
      label: 'Source Call Key',
      description:
        'Technical idempotency key generated from the source Call ID.',
      icon: 'IconFingerprint',
      isNullable: true,
      isUnique: true,
    },
    {
      universalIdentifier: AGENT_FIELD_ID,
      type: FieldType.RELATION,
      name: 'agent',
      label: 'Agent',
      description: 'Agent whose call is being evaluated.',
      icon: 'IconUser',
      relationTargetObjectMetadataUniversalIdentifier:
        AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        QA_SCORECARDS_ON_AGENT_FIELD_ID,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'agentId',
      },
    },
    {
      universalIdentifier: LEAD_FIELD_ID,
      type: FieldType.RELATION,
      name: 'lead',
      label: 'Lead',
      description: 'Lead associated with the evaluated call.',
      icon: 'IconTargetArrow',
      relationTargetObjectMetadataUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
      relationTargetFieldMetadataUniversalIdentifier:
        QA_SCORECARDS_ON_LEAD_FIELD_ID,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'leadId',
      },
    },
    {
      universalIdentifier: QA_MANAGER_FIELD_ID,
      type: FieldType.RELATION,
      name: 'qaManager',
      label: 'QA Manager',
      description: 'QA manager assigned to follow up on this scorecard.',
      icon: 'IconUserCheck',
      relationTargetObjectMetadataUniversalIdentifier:
        QA_MANAGER_OBJECT_UNIVERSAL_IDENTIFIER,
      relationTargetFieldMetadataUniversalIdentifier:
        QA_SCORECARDS_ON_QA_MANAGER_FIELD_ID,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'qaManagerId',
      },
    },
    {
      universalIdentifier: FOLLOW_UP_TASK_FIELD_ID,
      type: FieldType.RELATION,
      name: 'task',
      label: 'Follow-up Task',
      description: 'Task created for required compliance follow-up.',
      icon: 'IconCheckbox',
      relationTargetObjectMetadataUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.task.universalIdentifier,
      relationTargetFieldMetadataUniversalIdentifier:
        QA_SCORECARDS_ON_TASK_FIELD_ID,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'taskId',
      },
    },
    {
      universalIdentifier: STATUS_FIELD_ID,
      type: FieldType.SELECT,
      name: 'status',
      label: 'Status',
      description: 'Processing status of this QA scorecard.',
      icon: 'IconStatusChange',
      defaultValue: "'PENDING'",
      options: [
        {
          id: 'a1b2c3d4-0003-4000-8000-000000000001',
          value: 'PENDING',
          label: 'Pending',
          position: 0,
          color: 'gray',
        },
        {
          id: 'a1b2c3d4-0003-4000-8000-000000000007',
          value: 'COPYING_RECORDING',
          label: 'Copying Recording',
          position: 1,
          color: 'blue',
        },
        {
          id: 'a1b2c3d4-0003-4000-8000-000000000002',
          value: 'TRANSCRIBING',
          label: 'Transcribing',
          position: 2,
          color: 'blue',
        },
        {
          id: 'a1b2c3d4-0003-4000-8000-000000000008',
          value: 'SCORING',
          label: 'Scoring',
          position: 3,
          color: 'blue',
        },
        {
          id: 'a1b2c3d4-0003-4000-8000-000000000004',
          value: 'COMPLETED',
          label: 'Completed',
          position: 4,
          color: 'green',
        },
        {
          id: 'a1b2c3d4-0003-4000-8000-000000000005',
          value: 'FAILED',
          label: 'Failed',
          position: 5,
          color: 'red',
        },
        {
          id: 'a1b2c3d4-0003-4000-8000-000000000006',
          value: 'SKIPPED',
          label: 'Skipped',
          position: 6,
          color: 'gray',
        },
      ],
    },
    {
      universalIdentifier: PROCESSING_STARTED_AT_FIELD_ID,
      type: FieldType.DATE_TIME,
      name: 'processingStartedAt',
      label: 'Processing Started At',
      description: 'When Compliance QA processing started.',
      icon: 'IconCalendarClock',
    },
    {
      universalIdentifier: ANALYZED_AT_FIELD_ID,
      type: FieldType.DATE_TIME,
      name: 'analyzedAt',
      label: 'Analyzed At',
      description: 'When the compliance analysis completed.',
      icon: 'IconCalendarCheck',
    },
    {
      universalIdentifier: SCORE_FIELD_ID,
      type: FieldType.NUMBER,
      name: 'score',
      label: 'Score',
      description: 'Overall compliance score from 0 to 100.',
      icon: 'IconPercentage',
    },
    {
      universalIdentifier: RESULT_FIELD_ID,
      type: FieldType.SELECT,
      name: 'result',
      label: 'Result',
      description: 'Overall pass/fail result.',
      icon: 'IconCircleCheck',
      options: [
        {
          id: 'a1b2c3d4-0001-4000-8000-000000000001',
          value: 'PASS',
          label: 'Pass',
          position: 0,
          color: 'green',
        },
        {
          id: 'a1b2c3d4-0001-4000-8000-000000000002',
          value: 'FAIL',
          label: 'Fail',
          position: 1,
          color: 'red',
        },
        {
          id: 'a1b2c3d4-0001-4000-8000-000000000003',
          value: 'NEEDS_REVIEW',
          label: 'Needs Review',
          position: 2,
          color: 'orange',
        },
        {
          id: 'a1b2c3d4-0001-4000-8000-000000000004',
          value: 'NOT_APPLICABLE',
          label: 'Not Applicable',
          position: 3,
          color: 'gray',
        },
      ],
    },
    {
      universalIdentifier: TYPE_FIELD_ID,
      type: FieldType.SELECT,
      name: 'qaType',
      label: 'Type',
      description: 'Scoring rubric used for this call.',
      icon: 'IconPhoneCall',
      options: [
        {
          id: 'a1b2c3d4-0002-4000-8000-000000000001',
          value: 'ACA_SALE',
          label: 'ACA Sale',
          position: 0,
          color: 'blue',
        },
        {
          id: 'a1b2c3d4-0002-4000-8000-000000000004',
          value: 'ANCILLARY_ONLY',
          label: 'Ancillary Only',
          position: 1,
          color: 'purple',
        },
        {
          id: 'a1b2c3d4-0002-4000-8000-000000000005',
          value: 'UNKNOWN',
          label: 'Unknown',
          position: 2,
          color: 'gray',
        },
      ],
    },
    {
      universalIdentifier: RED_FLAG_FIELD_ID,
      type: FieldType.BOOLEAN,
      name: 'redFlag',
      label: 'Red Flag',
      description: 'Whether any red flag auto-fail was triggered.',
      icon: 'IconFlag',
    },
    {
      universalIdentifier: REASON_FIELD_ID,
      type: FieldType.TEXT,
      name: 'reason',
      label: 'Reason',
      description:
        'Concise reason for the result: which compliance breach failed it, why it needs review, or why it was not scorable.',
      icon: 'IconMessage2',
    },
  ],
});
