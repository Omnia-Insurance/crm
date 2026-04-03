/**
 * Shared types for relation import behaviors.
 * These mirror the server-side types in relation-resolution.types.ts.
 */

export type RelationBehavior = {
  /** The relation field name on the main object (e.g., "lead", "carrier") */
  relationFieldName: string;
  /** How to handle this relation during import */
  behavior: 'SKIP' | 'LOOKUP_ASSIGN' | 'SMART_UPDATE';
  /** What to do when a looked-up relation isn't found */
  onNotFound: 'ERROR' | 'CREATE';
  /** Fields on the related object with unique DB constraints (e.g., ["phones"]) */
  uniqueConstraintFields?: string[];
};
