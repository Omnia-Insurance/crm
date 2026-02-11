import { ObjectFilterDropdownComponentInstanceContext } from '@/object-record/object-filter-dropdown/states/contexts/ObjectFilterDropdownComponentInstanceContext';
import { createComponentState } from '@/ui/utilities/state/component-state/utils/createComponentState';

export const subFieldNameUsedInDropdownComponentState = createComponentState<
  string | null | undefined
>({
  key: 'subFieldNameUsedInDropdownComponentState',
  defaultValue: null,
  componentInstanceContext: ObjectFilterDropdownComponentInstanceContext,
});
