// Mirrors RelationBehavior in the server's import-job/utils/relation-resolution.types.ts
export type RelationBehavior = {
  // The relation field on the imported object, such as "lead" or "carrier"
  relationFieldName: string;
  behavior: 'SKIP' | 'LOOKUP_ASSIGN' | 'SMART_UPDATE';
  // What the server does when a looked-up related record is not found
  onNotFound: 'ERROR' | 'CREATE';
  // Fields of the related object with a unique constraint, such as ["phones"]
  uniqueConstraintFields?: string[];
};
