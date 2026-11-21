import { t } from '@lingui/core/macro';
import { isNonEmptyString } from '@sniptt/guards';

export const getImportJobLabel = ({
  objectLabelPlural,
  phase,
}: {
  objectLabelPlural: string;
  phase?: string;
}) =>
  isNonEmptyString(phase)
    ? t`${objectLabelPlural}: ${phase}`
    : t`Importing ${objectLabelPlural}`;
