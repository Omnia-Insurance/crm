export type RelationExportConfig = {
  // fieldName of the relation on the source object (e.g., "lead", "agent")
  relationFieldName: string;
  // label of the relation field (e.g., "Lead", "Agent")
  relationFieldLabel: string;
  // target object name singular (e.g., "person", "company")
  targetObjectNameSingular: string;
  // target object field paths to include (e.g., ["name", "productType.name"])
  selectedFieldPaths: string[];
};

export type ExportConfig = {
  relationConfigs: RelationExportConfig[];
};
