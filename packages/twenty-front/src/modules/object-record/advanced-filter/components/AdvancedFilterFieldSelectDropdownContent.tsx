import { AdvancedFilterFieldSelectMenu } from '@/object-record/advanced-filter/components/AdvancedFilterFieldSelectMenu';
import { AdvancedFilterRelationSubFieldSelectMenu } from '@/object-record/advanced-filter/components/AdvancedFilterRelationSubFieldSelectMenu';
import { AdvancedFilterSubFieldSelectMenu } from '@/object-record/advanced-filter/components/AdvancedFilterSubFieldSelectMenu';
import { objectFilterDropdownIsSelectingCompositeFieldComponentState } from '@/object-record/object-filter-dropdown/states/objectFilterDropdownIsSelectingCompositeFieldComponentState';
import { objectFilterDropdownIsSelectingRelationSubFieldComponentState } from '@/object-record/object-filter-dropdown/states/objectFilterDropdownIsSelectingRelationSubFieldComponentState';
import { useRecoilComponentState } from '@/ui/utilities/state/component-state/hooks/useRecoilComponentState';

type AdvancedFilterFieldSelectDropdownContentProps = {
  recordFilterId: string;
};

export const AdvancedFilterFieldSelectDropdownContent = ({
  recordFilterId,
}: AdvancedFilterFieldSelectDropdownContentProps) => {
  const [objectFilterDropdownIsSelectingCompositeField] =
    useRecoilComponentState(
      objectFilterDropdownIsSelectingCompositeFieldComponentState,
    );

  const [objectFilterDropdownIsSelectingRelationSubField] =
    useRecoilComponentState(
      objectFilterDropdownIsSelectingRelationSubFieldComponentState,
    );

  if (objectFilterDropdownIsSelectingRelationSubField) {
    return (
      <AdvancedFilterRelationSubFieldSelectMenu
        recordFilterId={recordFilterId}
      />
    );
  }

  if (objectFilterDropdownIsSelectingCompositeField) {
    return <AdvancedFilterSubFieldSelectMenu recordFilterId={recordFilterId} />;
  }

  return <AdvancedFilterFieldSelectMenu recordFilterId={recordFilterId} />;
};
