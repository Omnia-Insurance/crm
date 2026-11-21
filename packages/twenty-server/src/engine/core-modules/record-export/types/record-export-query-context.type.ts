import { type CommonBaseQueryRunnerContext } from 'src/engine/api/common/types/common-base-query-runner-context.type';
import { type CommonSelectedFields } from 'src/engine/api/common/types/common-selected-fields-result.type';
import { type RecordExportRelationSubFieldPlan } from 'src/engine/core-modules/record-export/types/record-export-relation-sub-field-plan.type';
import { type RecordExportColumn } from 'twenty-shared/types';

export type RecordExportQueryContext = {
  queryRunnerContext: CommonBaseQueryRunnerContext;
  columns: RecordExportColumn[];
  selectedFields: CommonSelectedFields;
  // OMNIA-CUSTOM: how readPage fills the relation sub-field cells
  relationSubFieldExportPlan?: RecordExportRelationSubFieldPlan;
};
