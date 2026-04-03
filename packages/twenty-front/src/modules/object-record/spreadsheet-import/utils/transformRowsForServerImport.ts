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
 * Parse a frontend update field key into relation name and sub-field path.
 *
 * "update:dateOfBirth (lead)" → { relation: "lead", path: "dateOfBirth" }
 * "update:primaryPhoneNumber-phones (lead)" → { relation: "lead", path: "phones.primaryPhoneNumber" }
 * "update:firstName-name (lead)" → { relation: "lead", path: "name.firstName" }
 */
function parseUpdateKey(
  key: string,
): { relation: string; dotPath: string } | null {
  const match = UPDATE_KEY_REGEX.exec(key);

  if (!match) return null;

  const rawField = match[1]; // e.g., "dateOfBirth", "primaryPhoneNumber-phones", "firstName-name"
  const relation = match[2]; // e.g., "lead"

  // Check if this is a composite sub-field: "subFieldKey-compositeFieldName"
  const dashIndex = rawField.indexOf('-');

  if (dashIndex !== -1) {
    const subFieldKey = rawField.substring(0, dashIndex);
    const compositeFieldName = rawField.substring(dashIndex + 1);

    return { relation, dotPath: `${compositeFieldName}.${subFieldKey}` };
  }

  return { relation, dotPath: rawField };
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

/**
 * Transform rows from frontend format to server format.
 *
 * Converts relation update keys (update:field (relation)) to dot notation
 * (relation.field) and relation label keys (__relationLabel:carrier) to
 * plain names (carrier).
 *
 * Also auto-detects which relations have data and builds relation behaviors.
 */
export function transformRowsForServerImport(
  rows: Record<string, unknown>[],
  configuredBehaviors?: RelationBehavior[],
): TransformResult {
  const detectedRelations = new Map<
    string,
    { hasSubFields: boolean; hasLabel: boolean }
  >();

  const transformedRows = rows.map((row) => {
    const transformed: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      // Try parsing as update field key
      const updateParsed = parseUpdateKey(key);

      if (updateParsed) {
        const dotKey = `${updateParsed.relation}.${updateParsed.dotPath}`;

        transformed[dotKey] = value;

        // Track detected relations
        const existing = detectedRelations.get(updateParsed.relation) ?? {
          hasSubFields: false,
          hasLabel: false,
        };

        existing.hasSubFields = true;
        detectedRelations.set(updateParsed.relation, existing);
        continue;
      }

      // Try parsing as relation label key
      const labelParsed = parseRelationLabelKey(key);

      if (labelParsed) {
        transformed[labelParsed.relation] = value;

        const existing = detectedRelations.get(labelParsed.relation) ?? {
          hasSubFields: false,
          hasLabel: false,
        };

        existing.hasLabel = true;
        detectedRelations.set(labelParsed.relation, existing);
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
