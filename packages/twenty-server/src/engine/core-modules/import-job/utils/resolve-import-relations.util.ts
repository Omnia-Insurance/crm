/**
 * Server-side relation resolution for import/re-import.
 *
 * Processes validated import rows to:
 * 1. Resolve LOOKUP_ASSIGN relations (carrier, product) by label identifier
 * 2. Resolve SMART_UPDATE relations (lead) with scoring-based matching
 * 3. Check unique constraints before updating related records
 * 4. Detect conflicts when multiple rows update the same related record differently
 * 5. Strip relation sub-field data from rows, leaving only direct fields for upsert
 */

import { type ObjectLiteral, type Repository } from 'typeorm';

import { FieldMetadataType } from 'twenty-shared/types';

import { type FlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/types/flat-entity-maps.type';
import { type FlatFieldMetadata } from 'src/engine/metadata-modules/flat-field-metadata/types/flat-field-metadata.type';
import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';

import {
  extractMatchDataFromRecord,
  isSamePerson,
} from './score-record-match.util';
import {
  type RelationBehavior,
  type RelationResolutionError,
  type RelationResolutionPlan,
  type RelatedRecordUpdate,
  type RelationReassignment,
  type NewRelatedRecord,
} from './relation-resolution.types';

const BATCH_SIZE = 200;

// ─── Metadata Helpers ─────────────────────────────────────────────────

function findObjectByName(
  nameSingular: string,
  objectMaps: FlatEntityMaps<FlatObjectMetadata>,
): FlatObjectMetadata | undefined {
  return Object.values(objectMaps.byUniversalIdentifier).find(
    (m) => m?.nameSingular === nameSingular,
  ) as FlatObjectMetadata | undefined;
}

function findFieldOnObject(
  objectId: string,
  fieldName: string,
  fieldMaps: FlatEntityMaps<FlatFieldMetadata>,
): FlatFieldMetadata | undefined {
  return Object.values(fieldMaps.byUniversalIdentifier).find(
    (f) => f?.objectMetadataId === objectId && f?.name === fieldName,
  ) as FlatFieldMetadata | undefined;
}

function getJoinColumnName(
  mainObjectName: string,
  relationFieldName: string,
  objectMaps: FlatEntityMaps<FlatObjectMetadata>,
  fieldMaps: FlatEntityMaps<FlatFieldMetadata>,
): string {
  const objectMeta = findObjectByName(mainObjectName, objectMaps);

  if (!objectMeta) return `${relationFieldName}Id`;

  const fieldMeta = findFieldOnObject(
    objectMeta.id,
    relationFieldName,
    fieldMaps,
  );

  return (
    (fieldMeta?.settings as Record<string, unknown> | undefined)
      ?.joinColumnName as string | undefined
  ) ?? `${relationFieldName}Id`;
}

function getRelationTargetObjectName(
  mainObjectName: string,
  relationFieldName: string,
  objectMaps: FlatEntityMaps<FlatObjectMetadata>,
  fieldMaps: FlatEntityMaps<FlatFieldMetadata>,
): string | undefined {
  const objectMeta = findObjectByName(mainObjectName, objectMaps);

  if (!objectMeta) return undefined;

  const fieldMeta = findFieldOnObject(
    objectMeta.id,
    relationFieldName,
    fieldMaps,
  );

  if (!fieldMeta?.relationTargetObjectMetadataId) return undefined;

  const targetObject = Object.values(
    objectMaps.byUniversalIdentifier,
  ).find(
    (m) => m?.id === fieldMeta.relationTargetObjectMetadataId,
  ) as FlatObjectMetadata | undefined;

  return targetObject?.nameSingular;
}

function getLabelIdentifierFieldName(
  objectNameSingular: string,
  objectMaps: FlatEntityMaps<FlatObjectMetadata>,
  fieldMaps: FlatEntityMaps<FlatFieldMetadata>,
): string | undefined {
  const objectMeta = findObjectByName(objectNameSingular, objectMaps);

  if (!objectMeta?.labelIdentifierFieldMetadataId) return undefined;

  const labelField = Object.values(
    fieldMaps.byUniversalIdentifier,
  ).find(
    (f) => f?.id === objectMeta.labelIdentifierFieldMetadataId,
  ) as FlatFieldMetadata | undefined;

  return labelField?.name;
}

function extractRecordLabel(record: Record<string, unknown>): string {
  if (typeof record.name === 'string' && record.name) return record.name;

  if (typeof record.name === 'object' && record.name !== null) {
    const nameObj = record.name as Record<string, unknown>;

    return [nameObj.firstName, nameObj.lastName].filter(Boolean).join(' ');
  }

  for (const key of ['title', 'label', 'displayName']) {
    if (typeof record[key] === 'string' && record[key]) {
      return record[key] as string;
    }
  }

  return '';
}

// ─── Row Parsing ──────────────────────────────────────────────────────

type ParsedRow = {
  rowIndex: number;
  directFields: Record<string, unknown>;
  relationData: Map<string, Record<string, unknown>>;
  relationLabels: Map<string, string>;
};

/**
 * Separate direct fields from relation sub-field data in each row.
 * Relation sub-fields use dot notation: "lead.phones.primaryPhoneNumber"
 * Relation labels are bare relation names: "carrier" (with string values)
 */
function parseRows(
  rows: Record<string, unknown>[],
  relationBehaviors: RelationBehavior[],
): ParsedRow[] {
  const relationNames = new Set(
    relationBehaviors.map((rb) => rb.relationFieldName),
  );

  return rows.map((row, rowIndex) => {
    const directFields: Record<string, unknown> = {};
    const relationData = new Map<string, Record<string, unknown>>();
    const relationLabels = new Map<string, string>();

    for (const [key, value] of Object.entries(row)) {
      const dotIndex = key.indexOf('.');

      if (dotIndex !== -1) {
        // Relation sub-field: "lead.phones.primaryPhoneNumber"
        const relationName = key.substring(0, dotIndex);
        const subFieldPath = key.substring(dotIndex + 1);

        if (relationNames.has(relationName)) {
          const existing = relationData.get(relationName) ?? {};

          existing[subFieldPath] = value;
          relationData.set(relationName, existing);
          continue;
        }
      }

      if (
        relationNames.has(key) &&
        typeof value === 'string' &&
        value.length > 0
      ) {
        // Relation label: "carrier" = "Ambetter"
        relationLabels.set(key, value);
        continue;
      }

      // Skip join columns for relations we're handling (e.g., carrierId)
      if (
        key.endsWith('Id') &&
        relationNames.has(key.slice(0, -2))
      ) {
        continue;
      }

      directFields[key] = value;
    }

    return { rowIndex, directFields, relationData, relationLabels };
  });
}

// ─── Batch Loading ────────────────────────────────────────────────────

async function batchLoadRecords(
  repository: Repository<ObjectLiteral>,
  objectNameSingular: string,
  ids: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const result = new Map<string, Record<string, unknown>>();

  if (ids.length === 0) return result;

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batchIds = ids.slice(i, i + BATCH_SIZE);

    const records = await repository
      .createQueryBuilder(objectNameSingular)
      .where(`"${objectNameSingular}"."id" IN (:...ids)`, {
        ids: batchIds,
      })
      .getMany();

    for (const record of records as Record<string, unknown>[]) {
      if (typeof record.id === 'string') {
        result.set(record.id, record);
      }
    }
  }

  return result;
}

// ─── LOOKUP_ASSIGN Resolution ─────────────────────────────────────────

async function resolveLookupAssign(
  rb: RelationBehavior,
  parsedRows: ParsedRow[],
  existingMainRecords: Map<string, Record<string, unknown>>,
  targetRepo: Repository<ObjectLiteral>,
  targetObjectName: string,
  joinColumnName: string,
  labelFieldName: string | undefined,
  errors: RelationResolutionError[],
  reassignments: RelationReassignment[],
): Promise<void> {
  // Collect unique label values
  const labelsToRowIndices = new Map<string, number[]>();

  for (const parsed of parsedRows) {
    const label = parsed.relationLabels.get(rb.relationFieldName);

    if (!label) continue;

    const existing = labelsToRowIndices.get(label) ?? [];

    existing.push(parsed.rowIndex);
    labelsToRowIndices.set(label, existing);
  }

  if (labelsToRowIndices.size === 0) return;

  // Batch lookup by label identifier field
  const searchField = labelFieldName ?? 'name';
  const labelValues = [...labelsToRowIndices.keys()];
  const labelToId = new Map<string, string>();

  for (let i = 0; i < labelValues.length; i += BATCH_SIZE) {
    const batch = labelValues.slice(i, i + BATCH_SIZE);

    const found = await targetRepo
      .createQueryBuilder(targetObjectName)
      .where(`"${targetObjectName}"."${searchField}" IN (:...values)`, {
        values: batch,
      })
      .getMany();

    for (const record of found as Record<string, unknown>[]) {
      const label = record[searchField];

      if (typeof label === 'string' && typeof record.id === 'string') {
        labelToId.set(label, record.id);
      }
    }
  }

  // Process results
  for (const [label, rowIndices] of labelsToRowIndices) {
    const matchedId = labelToId.get(label);

    if (!matchedId) {
      if (rb.onNotFound === 'ERROR') {
        for (const rowIndex of rowIndices) {
          errors.push({
            rowIndex,
            column: rb.relationFieldName,
            errorType: 'NOT_FOUND',
            message: `${rb.relationFieldName} "${label}" not found`,
            searchedValue: label,
          });
        }
      }
      continue;
    }

    // Queue reassignments only where the FK actually changed
    for (const rowIndex of rowIndices) {
      const mainRecordId = parsedRows[rowIndex].directFields.id as string;
      const existingMain = existingMainRecords.get(mainRecordId);
      const currentFk = existingMain?.[joinColumnName] as string | undefined;

      if (currentFk !== matchedId) {
        reassignments.push({
          mainRecordId,
          joinColumnName,
          newRelatedRecordId: matchedId,
        });
      }
    }
  }
}

// ─── SMART_UPDATE Resolution ──────────────────────────────────────────

async function resolveSmartUpdate(
  rb: RelationBehavior,
  parsedRows: ParsedRow[],
  existingMainRecords: Map<string, Record<string, unknown>>,
  getRepository: (objectName: string) => Promise<Repository<ObjectLiteral>>,
  mainObjectName: string,
  targetObjectName: string,
  joinColumnName: string,
  objectMaps: FlatEntityMaps<FlatObjectMetadata>,
  fieldMaps: FlatEntityMaps<FlatFieldMetadata>,
  errors: RelationResolutionError[],
  relatedRecordUpdates: RelatedRecordUpdate[],
  reassignments: RelationReassignment[],
  newRecords: NewRelatedRecord[],
): Promise<void> {
  const targetRepo = await getRepository(targetObjectName);

  // Load all existing related records
  const relatedIds = [
    ...new Set(
      parsedRows
        .map((parsed) => {
          const mainId = parsed.directFields.id as string;
          const existing = existingMainRecords.get(mainId);

          return existing?.[joinColumnName] as string | undefined;
        })
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];

  const existingRelated = await batchLoadRecords(
    targetRepo,
    targetObjectName,
    relatedIds,
  );

  for (const parsed of parsedRows) {
    const subFields = parsed.relationData.get(rb.relationFieldName);
    const csvLabel = parsed.relationLabels.get(rb.relationFieldName);

    if (!subFields && !csvLabel) continue;

    const mainId = parsed.directFields.id as string;
    const existingMain = existingMainRecords.get(mainId);
    const currentRelatedId = existingMain?.[joinColumnName] as
      | string
      | undefined;
    const currentRelated = currentRelatedId
      ? existingRelated.get(currentRelatedId)
      : undefined;

    // Build match data from CSV
    const csvMatchData = buildMatchDataFromSubFields(
      subFields ?? {},
      csvLabel,
    );

    if (currentRelated) {
      // Compare CSV data against existing related record
      const existingMatchData = extractMatchDataFromRecord(currentRelated);
      const { same, score } = isSamePerson(existingMatchData, csvMatchData);

      if (same) {
        // SAME PERSON — check unique constraints then update
        const constraintConflict = await checkUniqueConstraints(
          rb,
          subFields ?? {},
          currentRelated,
          currentRelatedId!,
          targetRepo,
          targetObjectName,
        );

        if (constraintConflict) {
          // The changed value belongs to another record → REASSIGN to that record
          reassignments.push({
            mainRecordId: mainId,
            joinColumnName,
            newRelatedRecordId: constraintConflict.conflictRecordId,
          });

          // Apply remaining (non-conflicting) sub-field edits to the NEW record
          const nonConflictingUpdates = buildSubFieldUpdates(
            subFields ?? {},
            constraintConflict.conflictRecord,
            [constraintConflict.conflictFieldName],
          );

          if (
            nonConflictingUpdates &&
            Object.keys(nonConflictingUpdates).length > 0
          ) {
            relatedRecordUpdates.push({
              recordId: constraintConflict.conflictRecordId,
              objectNameSingular: targetObjectName,
              fields: nonConflictingUpdates,
              sourceRowIndices: [parsed.rowIndex],
            });
          }
        } else {
          // No conflicts — update the existing related record
          const updates = buildSubFieldUpdates(
            subFields ?? {},
            currentRelated,
          );

          if (updates && Object.keys(updates).length > 0) {
            relatedRecordUpdates.push({
              recordId: currentRelatedId!,
              objectNameSingular: targetObjectName,
              fields: updates,
              sourceRowIndices: [parsed.rowIndex],
            });
          }
        }
      } else {
        // DIFFERENT PERSON — search for matching record
        const match = await searchForRecord(
          targetRepo,
          targetObjectName,
          csvMatchData,
        );

        if (match) {
          reassignments.push({
            mainRecordId: mainId,
            joinColumnName,
            newRelatedRecordId: match.recordId,
          });

          // Apply sub-field edits to the matched record
          const updates = buildSubFieldUpdates(
            subFields ?? {},
            match.record,
          );

          if (updates && Object.keys(updates).length > 0) {
            relatedRecordUpdates.push({
              recordId: match.recordId,
              objectNameSingular: targetObjectName,
              fields: updates,
              sourceRowIndices: [parsed.rowIndex],
            });
          }
        } else if (rb.onNotFound === 'CREATE') {
          const newData = buildNewRecordData(subFields ?? {}, csvLabel);

          newRecords.push({
            objectNameSingular: targetObjectName,
            data: newData,
            reassignment: {
              mainRecordId: mainId,
              joinColumnName,
            },
          });
        } else {
          errors.push({
            rowIndex: parsed.rowIndex,
            column: rb.relationFieldName,
            errorType: 'NOT_FOUND',
            message: `No matching ${targetObjectName} found for "${csvLabel ?? 'unknown'}"`,
          });
        }
      }
    } else if (csvMatchData.email ?? csvMatchData.phone ?? csvMatchData.firstName) {
      // No current related record — search or create
      const match = await searchForRecord(
        targetRepo,
        targetObjectName,
        csvMatchData,
      );

      if (match) {
        reassignments.push({
          mainRecordId: mainId,
          joinColumnName,
          newRelatedRecordId: match.recordId,
        });
      } else if (rb.onNotFound === 'CREATE') {
        const newData = buildNewRecordData(subFields ?? {}, csvLabel);

        newRecords.push({
          objectNameSingular: targetObjectName,
          data: newData,
          reassignment: {
            mainRecordId: mainId,
            joinColumnName,
          },
        });
      }
    }
  }
}

// ─── Sub-field Helpers ────────────────────────────────────────────────

type UniqueConstraintConflict = {
  conflictRecordId: string;
  conflictRecord: Record<string, unknown>;
  conflictFieldName: string;
};

async function checkUniqueConstraints(
  rb: RelationBehavior,
  csvSubFields: Record<string, unknown>,
  currentRelated: Record<string, unknown>,
  currentRelatedId: string,
  targetRepo: Repository<ObjectLiteral>,
  targetObjectName: string,
): Promise<UniqueConstraintConflict | null> {
  for (const constraintField of rb.uniqueConstraintFields ?? []) {
    // Get CSV value for this constraint field (may be composite path)
    const csvValue = getCompositeOrScalar(csvSubFields, constraintField);
    const existingValue = currentRelated[constraintField];

    if (csvValue === undefined || csvValue === null) continue;
    if (valuesEqual(csvValue, existingValue)) continue;

    // Value changed — check if another record owns it
    const searchColumn = getUniqueSearchColumn(constraintField, csvValue);

    if (!searchColumn) continue;

    try {
      const conflict = await targetRepo
        .createQueryBuilder(targetObjectName)
        .where(
          `"${targetObjectName}"."${searchColumn.column}" = :value`,
          { value: searchColumn.value },
        )
        .andWhere(`"${targetObjectName}"."id" != :excludeId`, {
          excludeId: currentRelatedId,
        })
        .andWhere(`"${targetObjectName}"."deletedAt" IS NULL`)
        .getOne();

      if (conflict) {
        return {
          conflictRecordId: (conflict as Record<string, unknown>).id as string,
          conflictRecord: conflict as Record<string, unknown>,
          conflictFieldName: constraintField,
        };
      }
    } catch {
      // Column might not exist — skip this check
    }
  }

  return null;
}

function getUniqueSearchColumn(
  fieldName: string,
  value: unknown,
): { column: string; value: unknown } | null {
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;

    if ('primaryPhoneNumber' in obj && obj.primaryPhoneNumber) {
      return {
        column: `${fieldName}PrimaryPhoneNumber`,
        value: String(obj.primaryPhoneNumber).replace(/[^0-9]/g, ''),
      };
    }

    if ('primaryEmail' in obj && obj.primaryEmail) {
      return {
        column: `${fieldName}PrimaryEmail`,
        value: String(obj.primaryEmail).toLowerCase(),
      };
    }

    return null;
  }

  if (typeof value === 'string' && value.length > 0) {
    return { column: fieldName, value };
  }

  return null;
}

function getCompositeOrScalar(
  subFields: Record<string, unknown>,
  fieldName: string,
): unknown {
  // Check for direct match
  if (fieldName in subFields) return subFields[fieldName];

  // Check for composite sub-fields: "phones.primaryPhoneNumber" etc.
  const composite: Record<string, unknown> = {};
  let hasSubFields = false;

  for (const [key, value] of Object.entries(subFields)) {
    if (key.startsWith(`${fieldName}.`)) {
      const subKey = key.substring(fieldName.length + 1);

      composite[subKey] = value;
      hasSubFields = true;
    }
  }

  return hasSubFields ? composite : undefined;
}

function buildSubFieldUpdates(
  csvSubFields: Record<string, unknown>,
  existingRecord: Record<string, unknown>,
  excludeFields?: string[],
): Record<string, unknown> | null {
  const updates: Record<string, unknown> = {};
  const excludeSet = new Set(excludeFields ?? []);

  // Group dotted paths into composite objects
  const composites = new Map<string, Record<string, unknown>>();
  const scalars = new Map<string, unknown>();

  for (const [path, value] of Object.entries(csvSubFields)) {
    const dotIndex = path.indexOf('.');

    if (dotIndex !== -1) {
      const parent = path.substring(0, dotIndex);

      if (excludeSet.has(parent)) continue;

      const child = path.substring(dotIndex + 1);
      const existing = composites.get(parent) ?? {};

      existing[child] = value;
      composites.set(parent, existing);
    } else {
      if (excludeSet.has(path)) continue;

      scalars.set(path, value);
    }
  }

  // Check scalar changes
  for (const [fieldName, csvValue] of scalars) {
    const existingValue = existingRecord[fieldName];

    if (!valuesEqual(csvValue, existingValue)) {
      updates[fieldName] = csvValue;
    }
  }

  // Check composite changes
  for (const [fieldName, csvComposite] of composites) {
    const existingComposite = existingRecord[fieldName] as
      | Record<string, unknown>
      | undefined;

    if (!existingComposite) {
      updates[fieldName] = csvComposite;
      continue;
    }

    let changed = false;

    for (const [subKey, csvSubValue] of Object.entries(csvComposite)) {
      if (!valuesEqual(csvSubValue, existingComposite[subKey])) {
        changed = true;
        break;
      }
    }

    if (changed) {
      // Merge to preserve unchanged sub-fields
      updates[fieldName] = { ...existingComposite, ...csvComposite };
    }
  }

  return Object.keys(updates).length > 0 ? updates : null;
}

function buildNewRecordData(
  csvSubFields: Record<string, unknown>,
  label?: string,
): Record<string, unknown> {
  const record: Record<string, unknown> = {};

  for (const [path, value] of Object.entries(csvSubFields)) {
    const dotIndex = path.indexOf('.');

    if (dotIndex !== -1) {
      const parent = path.substring(0, dotIndex);
      const child = path.substring(dotIndex + 1);
      const existing =
        (record[parent] as Record<string, unknown> | undefined) ?? {};

      existing[child] = value;
      record[parent] = existing;
    } else {
      record[path] = value;
    }
  }

  if (label && !record.name) {
    const parts = label.split(' ');

    record.name = {
      firstName: parts[0] ?? '',
      lastName: parts.slice(1).join(' ') ?? '',
    };
  }

  return record;
}

import { type RecordMatchData } from './score-record-match.util';

function buildMatchDataFromSubFields(
  subFields: Record<string, unknown>,
  label?: string,
): RecordMatchData {
  const result: RecordMatchData = {};

  // Name
  const nameObj = getCompositeOrScalar(subFields, 'name');

  if (typeof nameObj === 'object' && nameObj !== null) {
    const n = nameObj as Record<string, unknown>;

    result.firstName = n.firstName as string | undefined;
    result.lastName = n.lastName as string | undefined;
  } else if (label) {
    const parts = label.split(' ');

    result.firstName = parts[0];
    result.lastName = parts.slice(1).join(' ') || undefined;
  }

  // Phone
  const phonesObj = getCompositeOrScalar(subFields, 'phones');

  if (typeof phonesObj === 'object' && phonesObj !== null) {
    result.phone = (phonesObj as Record<string, unknown>)
      .primaryPhoneNumber as string | undefined;
  }

  // Email
  const emailsObj = getCompositeOrScalar(subFields, 'emails');

  if (typeof emailsObj === 'object' && emailsObj !== null) {
    result.email = (emailsObj as Record<string, unknown>)
      .primaryEmail as string | undefined;
  }

  // Address
  const addressObj =
    getCompositeOrScalar(subFields, 'addressCustom') ??
    getCompositeOrScalar(subFields, 'address');

  if (typeof addressObj === 'object' && addressObj !== null) {
    const addr = addressObj as Record<string, unknown>;

    result.city = addr.addressCity as string | undefined;
    result.state = addr.addressState as string | undefined;
  }

  return result;
}

async function searchForRecord(
  repository: Repository<ObjectLiteral>,
  objectNameSingular: string,
  matchData: RecordMatchData,
): Promise<{ recordId: string; record: Record<string, unknown> } | null> {
  // Search by email (strongest signal)
  if (matchData.email) {
    try {
      const byEmail = await repository
        .createQueryBuilder(objectNameSingular)
        .where(
          `"${objectNameSingular}"."emailsPrimaryEmail" ILIKE :email`,
          { email: matchData.email },
        )
        .andWhere(`"${objectNameSingular}"."deletedAt" IS NULL`)
        .getOne();

      if (byEmail) {
        const record = byEmail as Record<string, unknown>;

        return { recordId: record.id as string, record };
      }
    } catch {
      // Column might not exist
    }
  }

  // Search by phone
  if (matchData.phone) {
    const normalized = matchData.phone.replace(/[^0-9]/g, '');

    try {
      const byPhone = await repository
        .createQueryBuilder(objectNameSingular)
        .where(
          `"${objectNameSingular}"."phonesPrimaryPhoneNumber" = :phone`,
          { phone: normalized },
        )
        .andWhere(`"${objectNameSingular}"."deletedAt" IS NULL`)
        .getOne();

      if (byPhone) {
        const record = byPhone as Record<string, unknown>;

        return { recordId: record.id as string, record };
      }
    } catch {
      // Column might not exist
    }
  }

  // Search by exact name match
  if (matchData.firstName && matchData.lastName) {
    try {
      const byName = await repository
        .createQueryBuilder(objectNameSingular)
        .where(
          `"${objectNameSingular}"."nameFirstName" ILIKE :firstName`,
          { firstName: matchData.firstName },
        )
        .andWhere(
          `"${objectNameSingular}"."nameLastName" ILIKE :lastName`,
          { lastName: matchData.lastName },
        )
        .andWhere(`"${objectNameSingular}"."deletedAt" IS NULL`)
        .limit(2)
        .getMany();

      // Only match if exactly 1 result (no ambiguity)
      if (byName.length === 1) {
        const record = byName[0] as Record<string, unknown>;

        return { recordId: record.id as string, record };
      }
    } catch {
      // Columns might not exist
    }
  }

  return null;
}

// ─── Conflict Detection ───────────────────────────────────────────────

function detectConflicts(
  updates: RelatedRecordUpdate[],
  errors: RelationResolutionError[],
): void {
  // Group by target record
  const grouped = new Map<string, RelatedRecordUpdate[]>();

  for (const update of updates) {
    const key = `${update.objectNameSingular}:${update.recordId}`;
    const existing = grouped.get(key) ?? [];

    existing.push(update);
    grouped.set(key, existing);
  }

  for (const [, groupUpdates] of grouped) {
    if (groupUpdates.length <= 1) continue;

    // Check each field for conflicting values
    const fieldValues = new Map<
      string,
      { value: unknown; rows: number[] }
    >();

    for (const update of groupUpdates) {
      for (const [fieldName, value] of Object.entries(update.fields)) {
        const existing = fieldValues.get(fieldName);

        if (!existing) {
          fieldValues.set(fieldName, {
            value,
            rows: [...update.sourceRowIndices],
          });
        } else if (!valuesEqual(existing.value, value)) {
          errors.push({
            rowIndex: update.sourceRowIndices[0],
            column: fieldName,
            errorType: 'CONFLICT',
            message: `Conflicting values for ${fieldName} on the same related record`,
            conflictingRows: [
              ...existing.rows,
              ...update.sourceRowIndices,
            ],
          });
        }
      }
    }
  }
}

function deduplicateUpdates(
  updates: RelatedRecordUpdate[],
): RelatedRecordUpdate[] {
  const grouped = new Map<string, RelatedRecordUpdate>();

  for (const update of updates) {
    const key = `${update.objectNameSingular}:${update.recordId}`;
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, { ...update, fields: { ...update.fields } });
    } else {
      // Merge fields (conflict detection already ensured no conflicts)
      Object.assign(existing.fields, update.fields);
      existing.sourceRowIndices.push(...update.sourceRowIndices);
    }
  }

  return [...grouped.values()];
}

// ─── Value Comparison ─────────────────────────────────────────────────

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a === '' && b == null) return true;
  if (a == null && b === '') return true;

  if (
    typeof a === 'object' &&
    typeof b === 'object' &&
    a !== null &&
    b !== null
  ) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  return String(a) === String(b);
}

// ─── Main Entry Point ─────────────────────────────────────────────────

export async function resolveImportRelations(
  rows: Record<string, unknown>[],
  relationBehaviors: RelationBehavior[],
  mainObjectName: string,
  objectMaps: FlatEntityMaps<FlatObjectMetadata>,
  fieldMaps: FlatEntityMaps<FlatFieldMetadata>,
  getRepository: (objectName: string) => Promise<Repository<ObjectLiteral>>,
): Promise<RelationResolutionPlan> {
  const errors: RelationResolutionError[] = [];
  const relatedRecordUpdates: RelatedRecordUpdate[] = [];
  const reassignments: RelationReassignment[] = [];
  const newRecords: NewRelatedRecord[] = [];

  // Parse rows to separate direct fields from relation data
  const parsedRows = parseRows(rows, relationBehaviors);

  // Load existing main records (needed for FK lookups)
  const mainRecordIds = parsedRows
    .map((p) => p.directFields.id)
    .filter((id): id is string => typeof id === 'string');

  const mainRepo = await getRepository(mainObjectName);
  const existingMainRecords = await batchLoadRecords(
    mainRepo,
    mainObjectName,
    mainRecordIds,
  );

  // Process each relation behavior
  for (const rb of relationBehaviors) {
    if (rb.behavior === 'SKIP') continue;

    const targetObjectName = getRelationTargetObjectName(
      mainObjectName,
      rb.relationFieldName,
      objectMaps,
      fieldMaps,
    );

    if (!targetObjectName) continue;

    const joinColumnName = getJoinColumnName(
      mainObjectName,
      rb.relationFieldName,
      objectMaps,
      fieldMaps,
    );

    if (rb.behavior === 'LOOKUP_ASSIGN') {
      const targetRepo = await getRepository(targetObjectName);
      const labelFieldName = getLabelIdentifierFieldName(
        targetObjectName,
        objectMaps,
        fieldMaps,
      );

      await resolveLookupAssign(
        rb,
        parsedRows,
        existingMainRecords,
        targetRepo,
        targetObjectName,
        joinColumnName,
        labelFieldName,
        errors,
        reassignments,
      );
    } else if (rb.behavior === 'SMART_UPDATE') {
      await resolveSmartUpdate(
        rb,
        parsedRows,
        existingMainRecords,
        getRepository,
        mainObjectName,
        targetObjectName,
        joinColumnName,
        objectMaps,
        fieldMaps,
        errors,
        relatedRecordUpdates,
        reassignments,
        newRecords,
      );
    }
  }

  // Detect conflicts (multiple rows updating same related record differently)
  detectConflicts(relatedRecordUpdates, errors);

  // Build processed rows (direct fields only, with resolved FKs)
  const processedRows = parsedRows.map((parsed) => {
    const row = { ...parsed.directFields };

    // Apply reassignments to the row's FK columns
    for (const reassignment of reassignments) {
      if (reassignment.mainRecordId === row.id) {
        row[reassignment.joinColumnName] = reassignment.newRelatedRecordId;
      }
    }

    return row;
  });

  return {
    errors,
    relatedRecordUpdates: deduplicateUpdates(relatedRecordUpdates),
    reassignments,
    newRecords,
    processedRows,
  };
}
