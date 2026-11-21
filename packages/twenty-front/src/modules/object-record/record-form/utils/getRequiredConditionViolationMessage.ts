import { t } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

export const getRequiredConditionViolationMessage = ({
  fieldLabel,
  relationLabel,
  isReadOnly,
  isAgentProfileRelation,
}: {
  fieldLabel: string;
  relationLabel?: string;
  isReadOnly: boolean;
  isAgentProfileRelation: boolean;
}): string => {
  const label = isDefined(relationLabel)
    ? `${relationLabel}: ${fieldLabel}`
    : fieldLabel;

  if (isReadOnly && isAgentProfileRelation) {
    return t`No agent profile is linked to your account, so ${label} can't be filled in. Ask an admin to link one.`;
  }

  if (isReadOnly) {
    return t`${label} is required, but you don't have permission to edit it. Ask an admin.`;
  }

  if (isDefined(relationLabel)) {
    const relationLabelLowercase = relationLabel.toLowerCase();

    return t`${label} is required. Open the ${relationLabelLowercase} to complete it.`;
  }

  return t`${label} is required`;
};
