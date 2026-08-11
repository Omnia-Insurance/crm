import { ViewBarFilterDropdownIds } from '@/views/constants/ViewBarFilterDropdownIds';

import { useResetFilterDropdown } from '@/object-record/object-filter-dropdown/hooks/useResetFilterDropdown';
import { useToggleDropdown } from '@/ui/layout/dropdown/hooks/useToggleDropdown';
import { t } from '@lingui/core/macro';
import { IconPlus } from 'twenty-ui/icon';
import { LightButton } from 'twenty-ui/input';

// OMNIA-CUSTOM: optional `dropdownId` so this button can be reused inside a
// scoped filter UI (e.g. the audit-comments side panel) without toggling the
// page-level filter dropdown.
type ViewBarDetailsAddFilterButtonProps = {
  dropdownId?: string;
};

export const ViewBarDetailsAddFilterButton = ({
  dropdownId = ViewBarFilterDropdownIds.MAIN,
}: ViewBarDetailsAddFilterButtonProps = {}) => {
  const { toggleDropdown } = useToggleDropdown();

  const { resetFilterDropdown } = useResetFilterDropdown(dropdownId);

  const handleClick = () => {
    resetFilterDropdown();
    toggleDropdown({
      dropdownComponentInstanceIdFromProps: dropdownId,
    });
  };

  return (
    <LightButton
      onClick={handleClick}
      Icon={IconPlus}
      title={t`Add filter`}
      accent="tertiary"
    />
  );
};
