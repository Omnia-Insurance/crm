import { AdvancedFilterCompositeSubFieldSelectMenu } from '@/object-record/advanced-filter/components/AdvancedFilterCompositeSubFieldSelectMenu';
import { AdvancedFilterFieldSelectMenu } from '@/object-record/advanced-filter/components/AdvancedFilterFieldSelectMenu';
import { AdvancedFilterRelationSubFieldSelectMenu } from '@/object-record/advanced-filter/components/AdvancedFilterRelationSubFieldSelectMenu';
import { AdvancedFilterRelationTargetFieldSelectMenu } from '@/object-record/advanced-filter/components/AdvancedFilterRelationTargetFieldSelectMenu';
import { objectFilterDropdownIsSelectingCompositeFieldComponentState } from '@/object-record/object-filter-dropdown/states/objectFilterDropdownIsSelectingCompositeFieldComponentState';
import { objectFilterDropdownIsSelectingRelationSubFieldComponentState } from '@/object-record/object-filter-dropdown/states/objectFilterDropdownIsSelectingRelationSubFieldComponentState';
import { objectFilterDropdownIsSelectingRelationTargetFieldComponentState } from '@/object-record/object-filter-dropdown/states/objectFilterDropdownIsSelectingRelationTargetFieldComponentState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';

type AdvancedFilterFieldSelectDropdownContentProps = {
  recordFilterId: string;
};

export const AdvancedFilterFieldSelectDropdownContent = ({
  recordFilterId,
}: AdvancedFilterFieldSelectDropdownContentProps) => {
  const objectFilterDropdownIsSelectingCompositeField =
    useAtomComponentStateValue(
      objectFilterDropdownIsSelectingCompositeFieldComponentState,
    );

  const objectFilterDropdownIsSelectingRelationTargetField =
    useAtomComponentStateValue(
      objectFilterDropdownIsSelectingRelationTargetFieldComponentState,
    );

  const objectFilterDropdownIsSelectingRelationSubField =
    useAtomComponentStateValue(
      objectFilterDropdownIsSelectingRelationSubFieldComponentState,
    );

  if (objectFilterDropdownIsSelectingRelationTargetField) {
    return (
      <AdvancedFilterRelationTargetFieldSelectMenu
        recordFilterId={recordFilterId}
      />
    );
  }

  if (objectFilterDropdownIsSelectingRelationSubField) {
    return (
      <AdvancedFilterRelationSubFieldSelectMenu
        recordFilterId={recordFilterId}
      />
    );
  }

  if (objectFilterDropdownIsSelectingCompositeField) {
    return (
      <AdvancedFilterCompositeSubFieldSelectMenu
        recordFilterId={recordFilterId}
      />
    );
  }

  return <AdvancedFilterFieldSelectMenu recordFilterId={recordFilterId} />;
};
