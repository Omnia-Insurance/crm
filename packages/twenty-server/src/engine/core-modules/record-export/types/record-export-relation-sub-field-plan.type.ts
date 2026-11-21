export type RecordExportRelationSubFieldCell =
  | {
      kind: 'joinColumn';
      key: string;
      joinColumnName: string;
    }
  | {
      kind: 'value';
      key: string;
      relationFieldName: string;
      fieldName: string;
      isAddress: boolean;
    }
  | {
      kind: 'label';
      key: string;
      recordPath: string[];
      labelFieldName?: string;
    }
  | {
      kind: 'list';
      key: string;
      relationFieldName: string;
      fieldName: string;
      labelFieldName?: string;
      childObjectNameSingular: string;
      childJoinColumnName: string;
    };

export type RecordExportRelationSubFieldPlan = {
  cells: RecordExportRelationSubFieldCell[];
  addressFieldNames: string[];
};
