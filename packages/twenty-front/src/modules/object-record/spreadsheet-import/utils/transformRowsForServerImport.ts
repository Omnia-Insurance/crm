import { type RelationBehavior } from '@/object-record/spreadsheet-import/utils/relationImportTypes';
import { isDefined } from 'twenty-shared/utils';

// Rewrites dialog keys into the dot paths the server import job resolves relations from:
// "update:dateOfBirth (lead)" -> "lead.dateOfBirth", "update:primaryPhoneNumber-phones (lead)" ->
// "lead.phones.primaryPhoneNumber", "__relationLabel:carrier" -> "carrier"; "__readOnly:" keys are dropped.
// The dialog renames connect keys to "update:" first, so keys such as "Amount (premium)" stay direct fields.

type TransformRowsForServerImportResult = {
  transformedRows: Record<string, unknown>[];
  relationBehaviors: RelationBehavior[];
};

type DetectedRelation = {
  hasSubFields: boolean;
  hasLabel: boolean;
};

const UPDATE_KEY_REGEX = /^update:(.+)\s+\((\w+)\)$/;
const RELATION_LABEL_KEY_REGEX = /^__relationLabel:(\w+)$/;
const READ_ONLY_KEY_PREFIX = '__readOnly:';

// "primaryPhoneNumber-phones" -> "phones.primaryPhoneNumber"
const getDotPathFromRawFieldKey = (rawFieldKey: string) => {
  const dashIndex = rawFieldKey.indexOf('-');

  if (dashIndex === -1) {
    return rawFieldKey;
  }

  return `${rawFieldKey.substring(dashIndex + 1)}.${rawFieldKey.substring(0, dashIndex)}`;
};

export const transformRowsForServerImport = (
  rows: Record<string, unknown>[],
  configuredBehaviors?: RelationBehavior[],
): TransformRowsForServerImportResult => {
  const detectedRelationsByFieldName = new Map<string, DetectedRelation>();

  const getDetectedRelation = (relationFieldName: string) => {
    const existingDetectedRelation =
      detectedRelationsByFieldName.get(relationFieldName);

    if (isDefined(existingDetectedRelation)) {
      return existingDetectedRelation;
    }

    const detectedRelation: DetectedRelation = {
      hasSubFields: false,
      hasLabel: false,
    };

    detectedRelationsByFieldName.set(relationFieldName, detectedRelation);

    return detectedRelation;
  };

  const transformedRows = rows.map((row) => {
    const transformedRow: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(row)) {
      if (key.startsWith(READ_ONLY_KEY_PREFIX)) {
        continue;
      }

      const updateKeyMatch = UPDATE_KEY_REGEX.exec(key);

      if (isDefined(updateKeyMatch)) {
        const [, rawFieldKey, relationFieldName] = updateKeyMatch;

        transformedRow[
          `${relationFieldName}.${getDotPathFromRawFieldKey(rawFieldKey)}`
        ] = value;
        getDetectedRelation(relationFieldName).hasSubFields = true;
        continue;
      }

      const relationLabelKeyMatch = RELATION_LABEL_KEY_REGEX.exec(key);

      if (isDefined(relationLabelKeyMatch)) {
        const [, relationFieldName] = relationLabelKeyMatch;

        transformedRow[relationFieldName] = value;
        getDetectedRelation(relationFieldName).hasLabel = true;
        continue;
      }

      transformedRow[key] = value;
    }

    return transformedRow;
  });

  const relationBehaviorsByFieldName = new Map<string, RelationBehavior>(
    (configuredBehaviors ?? []).map((relationBehavior) => [
      relationBehavior.relationFieldName,
      relationBehavior,
    ]),
  );

  // A relation with data but no configured behavior: sub-fields mean a person-like record, a label alone a lookup
  for (const [
    relationFieldName,
    detectedRelation,
  ] of detectedRelationsByFieldName) {
    if (relationBehaviorsByFieldName.has(relationFieldName)) {
      continue;
    }

    if (detectedRelation.hasSubFields) {
      relationBehaviorsByFieldName.set(relationFieldName, {
        relationFieldName,
        behavior: 'SMART_UPDATE',
        onNotFound: 'CREATE',
        uniqueConstraintFields: ['phones'],
      });
      continue;
    }

    if (detectedRelation.hasLabel) {
      relationBehaviorsByFieldName.set(relationFieldName, {
        relationFieldName,
        behavior: 'LOOKUP_ASSIGN',
        onNotFound: 'ERROR',
      });
    }
  }

  return {
    transformedRows,
    relationBehaviors: [...relationBehaviorsByFieldName.values()],
  };
};
