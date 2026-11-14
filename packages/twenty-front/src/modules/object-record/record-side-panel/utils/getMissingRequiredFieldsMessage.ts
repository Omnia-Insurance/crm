import { t } from '@lingui/core/macro';

export type MissingRequiredField = {
  fieldName: string;
  fieldLabel: string;
  relationLabel?: string;
  isReadOnly: boolean;
  isAgentProfileRelation: boolean;
};

const getDisplayLabel = ({
  fieldLabel,
  relationLabel,
}: MissingRequiredField) =>
  relationLabel ? `${relationLabel}: ${fieldLabel}` : fieldLabel;

// Read-only fields lead: the user cannot fix them, so making them fill every
// other field first would just hide the real blocker.
export const getReportedMissingField = (
  missingFields: MissingRequiredField[],
): MissingRequiredField | undefined =>
  missingFields.find((field) => field.isReadOnly) ?? missingFields[0];

export const getMissingRequiredFieldsMessage = (
  missingFields: MissingRequiredField[],
): string | null => {
  const reportedField = getReportedMissingField(missingFields);

  if (reportedField === undefined) {
    return null;
  }

  if (reportedField.isReadOnly) {
    const label = getDisplayLabel(reportedField);

    if (reportedField.isAgentProfileRelation) {
      return t`No agent profile is linked to your account, so ${label} can't be filled in. Ask an admin to link one.`;
    }

    return t`${label} is required, but you don't have permission to edit it. Ask an admin.`;
  }

  const label = getDisplayLabel(reportedField);
  const remainingCount = missingFields.length - 1;

  if (remainingCount > 0) {
    return t`${label} is required (+${remainingCount} more)`;
  }

  return t`${label} is required`;
};
