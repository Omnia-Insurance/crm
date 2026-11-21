import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme';

import { ObjectFilterDropdownComponentInstanceContext } from '@/object-record/object-filter-dropdown/states/contexts/ObjectFilterDropdownComponentInstanceContext';
import { ViewBarDetails } from '@/views/components/ViewBarDetails';
import { ViewBarFilterDropdown } from '@/views/components/ViewBarFilterDropdown';
import { getViewBarFilterDropdownId } from '@/views/utils/getViewBarFilterDropdownId';

type ReconciliationFilterBarProps = {
  viewBarId: string;
};

const StyledRow = styled.div`
  align-items: center;
  display: flex;
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

// The table's own filter UI, keyed by viewBarId so it stays apart from any
// other filter bar on the page (the comments side panel has its own).
export const ReconciliationFilterBar = ({
  viewBarId,
}: ReconciliationFilterBarProps) => {
  return (
    <StyledRow>
      <StyledFilterButton>
        <ObjectFilterDropdownComponentInstanceContext.Provider
          value={{ instanceId: getViewBarFilterDropdownId(viewBarId) }}
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
