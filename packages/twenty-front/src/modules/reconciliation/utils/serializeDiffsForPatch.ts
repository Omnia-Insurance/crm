import type { FileContents } from '@pierre/diffs';

import type { FieldDiff } from '@/reconciliation/types/FieldDiff';

export type SerializedRecord = {
  oldFile: FileContents;
  newFile: FileContents;
  lineToFieldIndex: Map<number, number>;
  fieldToLineNumber: Map<number, number>;
};

const groupByObjectType = (
  diffs: FieldDiff[],
): { section: string; fields: { diff: FieldDiff; index: number }[] }[] => {
  const policyFields: { diff: FieldDiff; index: number }[] = [];
  const statusFields: { diff: FieldDiff; index: number }[] = [];
  const leadFields: { diff: FieldDiff; index: number }[] = [];

  diffs.forEach((diff, index) => {
    if (diff.action === 'COMPUTED') {
      statusFields.push({ diff, index });
    } else if (diff.crmObjectType === 'lead') {
      leadFields.push({ diff, index });
    } else {
      policyFields.push({ diff, index });
    }
  });

  const groups: {
    section: string;
    fields: { diff: FieldDiff; index: number }[];
  }[] = [];

  if (policyFields.length > 0) {
    groups.push({ section: 'Policy', fields: policyFields });
  }
  if (statusFields.length > 0) {
    groups.push({ section: 'Status', fields: statusFields });
  }
  if (leadFields.length > 0) {
    groups.push({ section: 'Lead', fields: leadFields });
  }

  return groups;
};

export const serializeRecordForDiff = (
  fieldDiffs: FieldDiff[],
  policyName?: string,
): SerializedRecord => {
  const lineToFieldIndex = new Map<number, number>();
  const fieldToLineNumber = new Map<number, number>();

  const oldLines: string[] = [];
  const newLines: string[] = [];

  const groups = groupByObjectType(fieldDiffs);
  let lineNumber = 0;

  groups.forEach((group, groupIndex) => {
    if (groupIndex > 0) {
      lineNumber++;
      oldLines.push('');
      newLines.push('');
    }

    lineNumber++;
    oldLines.push(`── ${group.section} ──`);
    newLines.push(`── ${group.section} ──`);

    group.fields.forEach(({ diff, index }) => {
      lineNumber++;
      lineToFieldIndex.set(lineNumber, index);
      fieldToLineNumber.set(index, lineNumber);

      const crmDisplay = diff.crmValue ?? '(empty)';
      const bobDisplay = diff.bobValue ?? '(empty)';

      oldLines.push(`${diff.label}: ${crmDisplay}`);

      const hasChange =
        diff.bobValue !== null && diff.bobValue !== diff.crmValue;

      if (hasChange) {
        newLines.push(`${diff.label}: ${bobDisplay}`);
      } else {
        newLines.push(`${diff.label}: ${crmDisplay}`);
      }
    });
  });

  const displayName = policyName ?? 'Policy Record';

  const oldFile: FileContents = {
    name: `CRM — ${displayName}`,
    contents: oldLines.join('\n') + '\n',
    lang: 'text',
  };

  const newFile: FileContents = {
    name: `Proposed — ${displayName}`,
    contents: newLines.join('\n') + '\n',
    lang: 'text',
  };

  return { oldFile, newFile, lineToFieldIndex, fieldToLineNumber };
};
