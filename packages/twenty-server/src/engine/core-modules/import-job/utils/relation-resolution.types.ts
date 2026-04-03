/**
 * Types for the import relation resolution system.
 *
 * When importing/re-importing records, relation columns can be:
 * - SKIP: read-only, ignore during import (e.g., Agent on Policy)
 * - LOOKUP_ASSIGN: match by label identifier, reassign (e.g., Carrier)
 * - SMART_UPDATE: score-based matching to determine update vs reassign (e.g., Lead)
 */

export type RelationBehaviorType = 'SKIP' | 'LOOKUP_ASSIGN' | 'SMART_UPDATE';
export type OnNotFoundAction = 'ERROR' | 'CREATE';

export type RelationBehavior = {
  /** The relation field name on the main object (e.g., "lead", "carrier") */
  relationFieldName: string;
  /** How to handle this relation during import */
  behavior: RelationBehaviorType;
  /** What to do when a looked-up relation isn't found */
  onNotFound: OnNotFoundAction;
  /** Fields on the related object with unique DB constraints (e.g., ["phones"]) */
  uniqueConstraintFields?: string[];
};

export type RelationResolutionError = {
  rowIndex: number;
  column: string;
  errorType:
    | 'NOT_FOUND'
    | 'AMBIGUOUS_MATCH'
    | 'CONFLICT';
  message: string;
  conflictingRows?: number[];
  searchedValue?: string;
};

export type RelatedRecordUpdate = {
  /** The related record to update */
  recordId: string;
  /** The object type of the related record */
  objectNameSingular: string;
  /** Fields to update on the related record */
  fields: Record<string, unknown>;
  /** CSV rows that contributed to this update (for conflict detection) */
  sourceRowIndices: number[];
};

export type RelationReassignment = {
  /** The main record whose FK needs updating */
  mainRecordId: string;
  /** The FK column to update (e.g., "leadId") */
  joinColumnName: string;
  /** The new related record ID */
  newRelatedRecordId: string;
};

export type NewRelatedRecord = {
  /** Object type to create */
  objectNameSingular: string;
  /** Data for the new record */
  data: Record<string, unknown>;
  /** After creation, reassign this main record's FK */
  reassignment: {
    mainRecordId: string;
    joinColumnName: string;
  };
};

export type RelationResolutionPlan = {
  /** Errors that prevent the import (all-or-nothing) */
  errors: RelationResolutionError[];
  /** Updates to apply to existing related records */
  relatedRecordUpdates: RelatedRecordUpdate[];
  /** FK reassignments on main records */
  reassignments: RelationReassignment[];
  /** New related records to create (with pending reassignments) */
  newRecords: NewRelatedRecord[];
  /** Processed main record rows with relation sub-field keys stripped */
  processedRows: Record<string, unknown>[];
};
