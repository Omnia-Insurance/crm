import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ObjectFilterDropdownComponentInstanceContext } from '@/object-record/object-filter-dropdown/states/contexts/ObjectFilterDropdownComponentInstanceContext';
import { ViewBarDetails } from '@/views/components/ViewBarDetails';
import { ViewBarFilterDropdown } from '@/views/components/ViewBarFilterDropdown';
import { ViewBarFilterDropdownIds } from '@/views/constants/ViewBarFilterDropdownIds';

type Props = {
  viewBarId: string;
};

const StyledRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${themeCssVariables.spacing[2]};
  padding: 0 ${themeCssVariables.spacing[2]};
`;

const StyledFilterButton = styled.div`
  flex-shrink: 0;
`;

const StyledChips = styled.div`
  flex: 1;
  min-width: 0;
`;

/**
 * Native Twenty filter UI for the reconciliation review page: persistent
 * "Filter" button on the left, chip strip + reset on the right. Uses the same
 * components the table view uses; isolated by `viewBarId`.
 */
export const ReconciliationFilterBar = ({ viewBarId }: Props) => {
  return (
    <StyledRow>
      <StyledFilterButton>
        <ObjectFilterDropdownComponentInstanceContext.Provider
          value={{ instanceId: ViewBarFilterDropdownIds.MAIN }}
        >
          <ViewBarFilterDropdown />
        </ObjectFilterDropdownComponentInstanceContext.Provider>
      </StyledFilterButton>
      <StyledChips>
        <ViewBarDetails
          viewBarId={viewBarId}
          objectNamePlural="reviewItems"
          hasFilterButton
        />
      </StyledChips>
    </StyledRow>
  );
};
