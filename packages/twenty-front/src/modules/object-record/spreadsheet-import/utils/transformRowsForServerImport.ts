/**
 * Transforms validated import rows from the frontend's key format to the
 * server's dot-notation format for relation sub-field resolution.
 *
 * Frontend keys:
 *   "update:dateOfBirth (lead)"            → "lead.dateOfBirth"
 *   "update:primaryPhoneNumber-phones (lead)" → "lead.phones.primaryPhoneNumber"
 *   "update:firstName-name (lead)"         → "lead.name.firstName"
 *   "__relationLabel:carrier"              → "carrier"
 *
 * Note: Connect field keys (e.g., "primaryPhoneNumber-phones (lead)") are
 * pre-converted to update: format by the dialog hook before reaching here.
 * This prevents ambiguity with composite field keys like "Amount (premium)".
 *
 * The server's import processor parses these dot-notation keys and resolves
 * relations using the configured behaviors (SKIP, LOOKUP_ASSIGN, SMART_UPDATE).
 */

import { type RelationBehavior } from './relationImportTypes';

type TransformResult = {
  /** Rows with relation sub-field data as dot-notation keys */
  transformedRows: Record<string, unknown>[];
  /** Auto-detected relation behaviors based on which relations have data */
  relationBehaviors: RelationBehavior[];
};

const UPDATE_KEY_REGEX = /^update:(.+)\s+\((\w+)\)$/;
const RELATION_LABEL_KEY_REGEX = /^__relationLabel:(\w+)$/;

/**
 * Parse a raw field part into a dot path.
 *
 * "dateOfBirth"                → "dateOfBirth"
 * "primaryPhoneNumber-phones"  → "phones.primaryPhoneNumber"
 * "firstName-name"             → "name.firstName"
 */
function rawFieldToDotPath(rawField: string): string {
  const dashIndex = rawField.indexOf('-');

  if (dashIndex !== -1) {
    const subFieldKey = rawField.substring(0, dashIndex);
    const compositeFieldName = rawField.substring(dashIndex + 1);

    return `${compositeFieldName}.${subFieldKey}`;
  }

  return rawField;
}

/**
 * Parse a frontend update field key into relation name and sub-field path.
 *
 * "update:dateOfBirth (lead)" → { relation: "lead", dotPath: "dateOfBirth", isUpdate: true }
 * "update:primaryPhoneNumber-phones (lead)" → { relation: "lead", dotPath: "phones.primaryPhoneNumber", isUpdate: true }
 */
function parseUpdateKey(
  key: string,
): { relation: string; dotPath: string } | null {
  const match = UPDATE_KEY_REGEX.exec(key);

  if (!match) return null;

  return { relation: match[2], dotPath: rawFieldToDotPath(match[1]) };
}

/**
 * Parse a relation label key.
 *
 * "__relationLabel:carrier" → { relation: "carrier" }
 */
function parseRelationLabelKey(
  key: string,
): { relation: string } | null {
  const match = RELATION_LABEL_KEY_REGEX.exec(key);

  if (!match) return null;

  return { relation: match[1] };
}

type DetectedRelationInfo = {
  hasSubFields: boolean;
  hasLabel: boolean;
};

/**
 * Transform rows from frontend format to server format.
 *
 * Converts relation update keys (update:field (relation)) and connect keys
 * (field (relation)) to dot notation (relation.field), and relation label
 * keys (__relationLabel:carrier) to plain names (carrier).
 *
 * Also auto-detects which relations have data and builds relation behaviors.
 */
export function transformRowsForServerImport(
  rows: Record<string, unknown>[],
  configuredBehaviors?: RelationBehavior[],
): TransformResult {
  const detectedRelations = new Map<string, DetectedRelationInfo>();

  const ensureDetected = (relation: string): DetectedRelationInfo => {
    const existing = detectedRelations.get(relation);

    if (existing) return existing;

    const info: DetectedRelationInfo = {
      hasSubFields: false,
      hasLabel: false,
    };

    detectedRelations.set(relation, info);

    return info;
  };

  const transformedRows = rows.map((row) => {
    const transformed: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      // Strip read-only keys (exported for reference only, not imported)
      if (key.startsWith('__readOnly:')) {
        continue;
      }

      // Try parsing as update field key (update:field (relation))
      // Connect field keys are pre-converted to update: format by the dialog.
      const updateParsed = parseUpdateKey(key);

      if (updateParsed) {
        transformed[`${updateParsed.relation}.${updateParsed.dotPath}`] = value;
        ensureDetected(updateParsed.relation).hasSubFields = true;
        continue;
      }

      // Try parsing as relation label key (__relationLabel:carrier)
      const labelParsed = parseRelationLabelKey(key);

      if (labelParsed) {
        transformed[labelParsed.relation] = value;
        ensureDetected(labelParsed.relation).hasLabel = true;
        continue;
      }

      // Pass through direct fields and other keys unchanged
      transformed[key] = value;
    }

    return transformed;
  });

  // Build relation behaviors from configured + detected
  const behaviorMap = new Map<string, RelationBehavior>();

  // Start with configured behaviors
  if (configuredBehaviors) {
    for (const rb of configuredBehaviors) {
      behaviorMap.set(rb.relationFieldName, rb);
    }
  }

  // Auto-detect behaviors for relations that weren't explicitly configured
  for (const [relationName, detected] of detectedRelations) {
    if (behaviorMap.has(relationName)) continue;

    if (detected.hasSubFields) {
      // Has sub-field data → SMART_UPDATE (for lead-like relations)
      behaviorMap.set(relationName, {
        relationFieldName: relationName,
        behavior: 'SMART_UPDATE',
        onNotFound: 'CREATE',
        uniqueConstraintFields: ['phones'], // TODO: detect from metadata
      });
    } else if (detected.hasLabel) {
      // Only has label → LOOKUP_ASSIGN (for carrier-like relations)
      behaviorMap.set(relationName, {
        relationFieldName: relationName,
        behavior: 'LOOKUP_ASSIGN',
        onNotFound: 'ERROR',
      });
    }
  }

  return {
    transformedRows,
    relationBehaviors: [...behaviorMap.values()],
  };
}
