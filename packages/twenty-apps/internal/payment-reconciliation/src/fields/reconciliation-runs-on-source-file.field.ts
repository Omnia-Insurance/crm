import { defineField, FieldType, RelationType } from 'twenty-sdk';

import {
  SOURCE_FILE_OBJECT_ID,
  RECONCILIATION_RUN_OBJECT_ID,
  RECONCILIATION_RUNS_ON_SOURCE_FILE_ID,
  SOURCE_FILE_ON_RECONCILIATION_RUN_ID,
} from 'src/constants/universal-identifiers';

export default defineField({
  universalIdentifier: RECONCILIATION_RUNS_ON_SOURCE_FILE_ID,
  objectUniversalIdentifier: SOURCE_FILE_OBJECT_ID,
  type: FieldType.RELATION,
  name: 'reconciliationRuns',
  label: 'Reconciliation Runs',
  relationTargetObjectMetadataUniversalIdentifier:
    RECONCILIATION_RUN_OBJECT_ID,
  relationTargetFieldMetadataUniversalIdentifier:
    SOURCE_FILE_ON_RECONCILIATION_RUN_ID,
  universalSettings: {
    relationType: RelationType.ONE_TO_MANY,
  },
  icon: 'IconPlayerPlay',
});
