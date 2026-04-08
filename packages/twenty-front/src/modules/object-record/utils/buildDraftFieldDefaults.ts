import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { FieldMetadataType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { stripSimpleQuotesFromString } from '~/utils/string/stripSimpleQuotesFromString';

/**
 * Build default field values for a draft record from its object metadata.
 *
 * Includes:
 * - SELECT / TEXT / BOOLEAN / NUMBER field defaults from metadata
 * - System fields: createdBy, updatedBy, createdAt, updatedAt
 * - submittedDate for objects that have it (e.g., Policy)
 */
export const buildDraftFieldDefaults = ({
  objectMetadataItem,
  currentMember,
}: {
  objectMetadataItem: EnrichedObjectMetadataItem;
  currentMember?: {
    id: string;
    name?: { firstName?: string | null; lastName?: string | null } | null;
  } | null;
}): Record<string, unknown> => {
  const fieldDefaults: Record<string, unknown> = {};
  const now = new Date().toISOString();

  for (const field of objectMetadataItem.fields) {
    if (!isDefined(field.defaultValue) || field.defaultValue === null) {
      continue;
    }

    if (
      field.type === FieldMetadataType.SELECT &&
      typeof field.defaultValue === 'string'
    ) {
      fieldDefaults[field.name] = stripSimpleQuotesFromString(
        field.defaultValue,
      );
    } else if (
      field.type === FieldMetadataType.TEXT &&
      typeof field.defaultValue === 'string'
    ) {
      const stripped = stripSimpleQuotesFromString(field.defaultValue);
      if (stripped !== '') {
        fieldDefaults[field.name] = stripped;
      }
    } else if (
      field.type === FieldMetadataType.BOOLEAN &&
      typeof field.defaultValue === 'boolean'
    ) {
      fieldDefaults[field.name] = field.defaultValue;
    } else if (
      field.type === FieldMetadataType.NUMBER &&
      typeof field.defaultValue === 'number'
    ) {
      fieldDefaults[field.name] = field.defaultValue;
    }
  }

  // Set system fields
  if (isDefined(currentMember)) {
    const memberName =
      `${currentMember.name?.firstName ?? ''} ${currentMember.name?.lastName ?? ''}`.trim();
    const actorValue = {
      source: 'MANUAL',
      workspaceMemberId: currentMember.id,
      name: memberName,
      context: null,
    };
    fieldDefaults.createdBy = actorValue;
    fieldDefaults.updatedBy = actorValue;
  }
  fieldDefaults.createdAt = now;
  fieldDefaults.updatedAt = now;

  // Set submittedDate for objects that have it (e.g., Policy)
  const submittedDateField = objectMetadataItem.fields.find(
    (f) => f.name === 'submittedDate' && f.isActive,
  );
  if (isDefined(submittedDateField)) {
    fieldDefaults.submittedDate = now;
  }

  return fieldDefaults;
};
