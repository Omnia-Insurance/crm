// OMNIA-CUSTOM: Displays a sub-field value from a related record.
// Used when a ViewField has subFieldName set (e.g., "Lead / Date of Birth").
//
// For standard field types (PHONES, EMAILS, ADDRESS, DATE, etc.), this
// component hydrates the related record into the Jotai record store under
// its own ID, then re-provides the FieldContext so native display components
// render with proper formatting, clickability, and styling.
//
// For nested relations (MANY_TO_ONE like leadSource) and ONE_TO_MANY
// (familyMembers), custom text formatting is used since they're depth-2
// relations that native components can't handle.

import { useContext, useMemo, useRef } from 'react';
import { useStore } from 'jotai';

import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { FieldDisplay } from '@/object-record/record-field/ui/components/FieldDisplay';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { type FieldDefinition } from '@/object-record/record-field/ui/types/FieldDefinition';
import { type FieldMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';
import { useRecordFieldValue } from '@/object-record/record-store/hooks/useRecordFieldValue';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { TextDisplay } from '@/ui/field/display/components/TextDisplay';
import { isDefined } from 'twenty-shared/utils';

export const RelationSubFieldDisplay = () => {
  const fieldContext = useContext(FieldContext);
  const { recordId, fieldDefinition } = fieldContext;
  const store = useStore();
  const { objectMetadataItems } = useObjectMetadataItems();

  const metadata = fieldDefinition.metadata as Record<string, unknown>;
  const subFieldName = metadata.subFieldName as string | undefined;
  const relationFieldName = fieldDefinition.metadata.fieldName;

  // Look up the sub-field's metadata on the target object to get type-specific
  // properties like `options` (for SELECT), `defaultValue`, etc.
  const targetObjectNameSingular = metadata.relationObjectMetadataNameSingular as
    | string
    | undefined;

  const subFieldMetadataItem = useMemo(() => {
    if (!targetObjectNameSingular || !subFieldName) return undefined;

    const targetObject = objectMetadataItems.find(
      (o) => o.nameSingular === targetObjectNameSingular,
    );

    return targetObject?.fields.find((f) => f.name === subFieldName);
  }, [objectMetadataItems, targetObjectNameSingular, subFieldName]);

  const relatedObject = useRecordFieldValue<Record<string, unknown> | null>(
    recordId,
    relationFieldName,
    fieldDefinition,
  );

  const hydratedRef = useRef<string | null>(null);
  const relatedRecordId = relatedObject?.id as string | undefined;

  // Hydrate the related record (and any nested relations it contains) into
  // the store under their own IDs so native display components can read them.
  if (
    isDefined(relatedRecordId) &&
    hydratedRef.current !== relatedRecordId
  ) {
    const recordAtom = recordStoreFamilyState.atomFamily(relatedRecordId);
    const existing = store.get(recordAtom);

    store.set(recordAtom, {
      ...existing,
      ...(relatedObject as ObjectRecord),
    });

    // Also hydrate nested relation objects (e.g., lead.leadSource)
    // so native relation chip displays can find them in the store.
    for (const value of Object.values(relatedObject)) {
      if (
        isDefined(value) &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        'id' in (value as Record<string, unknown>) &&
        '__typename' in (value as Record<string, unknown>)
      ) {
        const nestedRecord = value as ObjectRecord;
        const nestedAtom = recordStoreFamilyState.atomFamily(nestedRecord.id);
        const existingNested = store.get(nestedAtom);

        store.set(nestedAtom, { ...existingNested, ...nestedRecord });
      }
    }

    hydratedRef.current = relatedRecordId;
  }

  // Build a field definition for the sub-field that the native display
  // components can use. Includes type-specific metadata like `options`
  // (for SELECT/MULTI_SELECT) from the target object's field metadata.
  const subFieldDefinition = useMemo(
    (): FieldDefinition<FieldMetadata> => ({
      ...fieldDefinition,
      metadata: {
        ...fieldDefinition.metadata,
        fieldName: subFieldName ?? '',
        subFieldName: undefined,
        // Merge type-specific metadata from the actual field metadata item
        ...(subFieldMetadataItem?.options
          ? { options: subFieldMetadataItem.options }
          : {}),
        ...(subFieldMetadataItem?.defaultValue
          ? { defaultValue: subFieldMetadataItem.defaultValue }
          : {}),
        ...(subFieldMetadataItem?.relation
          ? {
              relationFieldMetadataId: subFieldMetadataItem.id,
              relationObjectMetadataNameSingular:
                subFieldMetadataItem.relation.targetObjectMetadata
                  ?.nameSingular,
              relationObjectMetadataNamePlural:
                subFieldMetadataItem.relation.targetObjectMetadata
                  ?.namePlural,
              relationObjectMetadataId:
                subFieldMetadataItem.relation.targetObjectMetadata?.id,
              relationType: subFieldMetadataItem.relation.type,
            }
          : {}),
        ...(subFieldMetadataItem?.settings
          ? { settings: subFieldMetadataItem.settings }
          : {}),
      } as FieldMetadata,
    }),
    [fieldDefinition, subFieldName, subFieldMetadataItem],
  );

  if (!isDefined(relatedObject) || !subFieldName) {
    return <TextDisplay text="" />;
  }

  const subFieldValue = relatedObject[subFieldName];

  // All sub-fields (including nested relations like leadSource and
  // familyMembers) go through native FieldDisplay for proper chip/field
  // rendering. The hydrated record store + enriched subFieldDefinition
  // provide enough context for native components to work.

  // Delegate to native FieldDisplay with FieldContext pointing at the
  // related record so native components render correctly.
  if (relatedRecordId) {
    return (
      <FieldContext.Provider
        value={{
          ...fieldContext,
          recordId: relatedRecordId,
          fieldDefinition: subFieldDefinition,
          isLabelIdentifier: false,
          isRecordFieldReadOnly: true,
        }}
      >
        <FieldDisplay />
      </FieldContext.Provider>
    );
  }

  // Fallback: format as text
  return <TextDisplay text={formatNestedValue(subFieldValue)} />;
};

// ---------------------------------------------------------------------------
// Helpers for detecting and formatting nested relations
// ---------------------------------------------------------------------------

/**
 * Fallback text formatter for when the related record isn't in the store.
 */
function formatNestedValue(value: unknown): string {
  if (!isDefined(value)) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';

  if (Array.isArray(value)) return formatRelationArray(value);

  if (typeof value !== 'object' || value === null) return '';

  const obj = value as Record<string, unknown>;

  if ('edges' in obj && Array.isArray(obj.edges)) {
    return formatRelationArray(obj.edges as unknown[]);
  }

  if ('__typename' in obj) return extractLabel(obj);

  return '';
}

function extractLabel(obj: Record<string, unknown>): string {
  if (typeof obj.name === 'string' && obj.name) return obj.name;

  if (typeof obj.name === 'object' && obj.name !== null) {
    const n = obj.name as Record<string, unknown>;

    return [n.firstName, n.lastName].filter(Boolean).join(' ');
  }

  for (const key of ['title', 'label', 'displayName']) {
    if (typeof obj[key] === 'string' && obj[key]) return obj[key] as string;
  }

  return '';
}

function formatRelationArray(items: unknown[]): string {
  if (items.length === 0) return '';

  return items
    .map((item) => {
      if (!isDefined(item) || typeof item !== 'object') return '';

      const rec = item as Record<string, unknown>;
      const node =
        'node' in rec && typeof rec.node === 'object'
          ? (rec.node as Record<string, unknown>)
          : rec;

      if (!isDefined(node) || typeof node !== 'object') return '';

      if ('memberType' in node || 'dateOfBirth' in node) {
        return formatFamilyMember(node);
      }

      return extractLabel(node);
    })
    .filter(Boolean)
    .join(' | ');
}

function formatFamilyMember(node: Record<string, unknown>): string {
  const parts: string[] = [];

  const name = extractLabel(node);

  if (name) parts.push(name);

  if (typeof node.memberType === 'string' && node.memberType) {
    parts.push(
      node.memberType.charAt(0).toUpperCase() +
        node.memberType.slice(1).toLowerCase(),
    );
  }

  if (typeof node.dateOfBirth === 'string' && node.dateOfBirth) {
    const date = new Date(node.dateOfBirth);

    if (!isNaN(date.getTime())) {
      const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(date.getUTCDate()).padStart(2, '0');
      const yy = String(date.getUTCFullYear()).slice(-2);

      parts.push(`${mm}/${dd}/${yy}`);
    }
  }

  return parts.join(' \u2022 ');
}
