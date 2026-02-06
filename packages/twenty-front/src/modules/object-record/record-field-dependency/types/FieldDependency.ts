export type FieldDependency = {
  dependentFieldName: string;
  dependentFieldMetadataId: string;
  parentFieldName: string;
  parentFieldMetadataId: string;
  bridgeFieldForeignKeyName: string;
};

export type FieldDependencyGraph = {
  dependenciesByField: Record<string, FieldDependency[]>;
  dependentsByField: Record<string, FieldDependency[]>;
};
