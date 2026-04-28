import type { FileContents } from '@pierre/diffs';

import type { FieldDiff } from '@/reconciliation/types/FieldDiff';
import type { ObjectRecord } from '@/object-record/types/ObjectRecord';

export type SerializedRecord = {
  oldFile: FileContents;
  newFile: FileContents;
  lineToFieldIndex: Map<number, number>;
};

type FieldMeta = {
  label: string;
  name: string;
  type: string;
};

const SKIP_FIELDS = new Set([
  'id',
  '__typename',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'position',
]);

const RELATION_TYPES = new Set(['RELATION']);

const formatValue = (value: unknown, type?: string): string => {
  if (value === null || value === undefined) return '(empty)';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';

  if (typeof value === 'object') {
    // Handle composite types: FullName, Links, etc.
    if ('firstName' in (value as Record<string, unknown>)) {
      const v = value as Record<string, string>;
      return [v.firstName, v.lastName].filter(Boolean).join(' ') || '(empty)';
    }
    if ('primaryEmail' in (value as Record<string, unknown>)) {
      return (value as Record<string, string>).primaryEmail || '(empty)';
    }
    if ('primaryPhoneNumber' in (value as Record<string, unknown>)) {
      return (
        (value as Record<string, string>).primaryPhoneNumber || '(empty)'
      );
    }
    if ('primaryLinkUrl' in (value as Record<string, unknown>)) {
      return (value as Record<string, string>).primaryLinkUrl || '(empty)';
    }
    if ('city' in (value as Record<string, unknown>)) {
      const v = value as Record<string, string>;
      return (
        [v.addressStreet1, v.addressCity, v.addressState, v.addressZipCode]
          .filter(Boolean)
          .join(', ') || '(empty)'
      );
    }
    if ('label' in (value as Record<string, unknown>)) {
      return (value as Record<string, string>).label || '(empty)';
    }
    // Relation object with name
    if ('name' in (value as Record<string, unknown>)) {
      return (value as Record<string, string>).name || '(empty)';
    }
    return JSON.stringify(value);
  }

  // Format dates nicely
  if (type === 'DATE' || type === 'DATE_TIME') {
    const d = new Date(value as string);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
  }

  return String(value);
};

export const serializeFullRecordForDiff = (
  policyRecord: ObjectRecord | null,
  leadRecord: ObjectRecord | null,
  policyFields: FieldMeta[],
  leadFields: FieldMeta[],
  fieldDiffs: FieldDiff[],
  displayName?: string,
): SerializedRecord => {
  const lineToFieldIndex = new Map<number, number>();

  const oldLines: string[] = [];
  const newLines: string[] = [];
  let lineNumber = 0;

  // Build a lookup from CRM field path → fieldDiff index
  const diffByCrmField = new Map<string, number>();
  const diffByLabel = new Map<string, number>();
  fieldDiffs.forEach((diff, index) => {
    if (diff.crmField) {
      diffByCrmField.set(diff.crmField, index);
    }
    diffByLabel.set(diff.label.toLowerCase(), index);
  });

  const serializeSection = (
    sectionName: string,
    record: ObjectRecord | null,
    fields: FieldMeta[],
    crmFieldPrefix: string,
  ) => {
    lineNumber++;
    oldLines.push(`[${sectionName}]`);
    newLines.push(`[${sectionName}]`);

    if (!record) {
      lineNumber++;
      oldLines.push('(no record)');
      newLines.push('(no record)');
      return;
    }

    for (const field of fields) {
      if (SKIP_FIELDS.has(field.name)) continue;
      if (RELATION_TYPES.has(field.type)) continue;

      lineNumber++;
      const value = (record as Record<string, unknown>)[field.name];
      const formatted = formatValue(value, field.type);

      // Check if there's a fieldDiff for this field
      const crmFieldPath =
        crmFieldPrefix === ''
          ? field.name
          : `${crmFieldPrefix}.${field.name}`;
      const diffIndex =
        diffByCrmField.get(crmFieldPath) ??
        diffByCrmField.get(field.name) ??
        diffByLabel.get(field.label.toLowerCase());

      if (diffIndex !== undefined) {
        lineToFieldIndex.set(lineNumber, diffIndex);
        const diff = fieldDiffs[diffIndex];
        const hasChange =
          diff.bobValue !== null && diff.bobValue !== diff.crmValue;

        oldLines.push(`${field.label}: ${formatted}`);
        newLines.push(
          hasChange
            ? `${field.label}: ${diff.bobValue}`
            : `${field.label}: ${formatted}`,
        );
      } else {
        // No diff for this field — context line
        oldLines.push(`${field.label}: ${formatted}`);
        newLines.push(`${field.label}: ${formatted}`);
      }
    }
  };

  // Serialize policy fields
  if (policyRecord) {
    serializeSection('Policy', policyRecord, policyFields, '');
  }

  // Add any fieldDiffs for computed/status fields that aren't in the policy metadata
  const statusDiffs = fieldDiffs.filter((d) => d.action === 'COMPUTED');
  if (statusDiffs.length > 0) {
    lineNumber++;
    oldLines.push('');
    newLines.push('');

    lineNumber++;
    oldLines.push('[Status]');
    newLines.push('[Status]');

    statusDiffs.forEach((diff) => {
      const index = fieldDiffs.indexOf(diff);
      lineNumber++;
      lineToFieldIndex.set(lineNumber, index);

      const crmDisplay = diff.crmValue ?? '(empty)';
      const bobDisplay = diff.bobValue ?? '(empty)';
      const hasChange =
        diff.bobValue !== null && diff.bobValue !== diff.crmValue;

      oldLines.push(`${diff.label}: ${crmDisplay}`);
      newLines.push(
        hasChange ? `${diff.label}: ${bobDisplay}` : `${diff.label}: ${crmDisplay}`,
      );
    });
  }

  // Serialize lead/person fields if lead record exists
  if (leadRecord && leadFields.length > 0) {
    lineNumber++;
    oldLines.push('');
    newLines.push('');

    serializeSection('Lead', leadRecord, leadFields, 'lead');
  }

  // Fallback: if no policy record, serialize from fieldDiffs only
  if (!policyRecord && fieldDiffs.length > 0) {
    const policyDiffs = fieldDiffs.filter(
      (d) => d.crmObjectType !== 'lead' && d.action !== 'COMPUTED',
    );
    const leadDiffs = fieldDiffs.filter((d) => d.crmObjectType === 'lead');

    if (policyDiffs.length > 0) {
      lineNumber++;
      oldLines.push('[Policy]');
      newLines.push('[Policy]');

      policyDiffs.forEach((diff) => {
        const index = fieldDiffs.indexOf(diff);
        lineNumber++;
        lineToFieldIndex.set(lineNumber, index);

        const crmDisplay = diff.crmValue ?? '(empty)';
        const bobDisplay = diff.bobValue ?? '(empty)';
        const hasChange =
          diff.bobValue !== null && diff.bobValue !== diff.crmValue;

        oldLines.push(`${diff.label}: ${crmDisplay}`);
        newLines.push(
          hasChange
            ? `${diff.label}: ${bobDisplay}`
            : `${diff.label}: ${crmDisplay}`,
        );
      });
    }

    if (leadDiffs.length > 0) {
      lineNumber++;
      oldLines.push('');
      newLines.push('');

      lineNumber++;
      oldLines.push('[Lead]');
      newLines.push('[Lead]');

      leadDiffs.forEach((diff) => {
        const index = fieldDiffs.indexOf(diff);
        lineNumber++;
        lineToFieldIndex.set(lineNumber, index);

        const crmDisplay = diff.crmValue ?? '(empty)';
        const bobDisplay = diff.bobValue ?? '(empty)';
        const hasChange =
          diff.bobValue !== null && diff.bobValue !== diff.crmValue;

        oldLines.push(`${diff.label}: ${crmDisplay}`);
        newLines.push(
          hasChange
            ? `${diff.label}: ${bobDisplay}`
            : `${diff.label}: ${crmDisplay}`,
        );
      });
    }
  }

  const name = displayName ?? 'Policy Record';

  const oldFile: FileContents = {
    name: `${name}.ini`,
    contents: oldLines.join('\n') + '\n',
    lang: 'ini',
  };

  const newFile: FileContents = {
    name: `${name}.ini`,
    contents: newLines.join('\n') + '\n',
    lang: 'ini',
  };

  return { oldFile, newFile, lineToFieldIndex };
};
