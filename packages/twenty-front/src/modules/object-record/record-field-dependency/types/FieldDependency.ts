export type FieldDependency = {
  dependentFieldName: string;
  dependentFieldMetadataId: string;
  parentFieldName: string;
  parentFieldMetadataId: string;
  bridgeFieldForeignKeyName: string;
  direction: 'forward' | 'reverse';
};

export type FieldDependencyGraph = {
  dependenciesByField: Record<string, FieldDependency[]>;
  dependentsByField: Record<string, FieldDependency[]>;
};
