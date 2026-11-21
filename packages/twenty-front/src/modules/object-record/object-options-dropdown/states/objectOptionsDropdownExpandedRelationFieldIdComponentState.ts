import { createAtomComponentState } from '@/ui/utilities/state/jotai/utils/createAtomComponentState';
import { ViewComponentInstanceContext } from '@/views/states/contexts/ViewComponentInstanceContext';

export const objectOptionsDropdownExpandedRelationFieldIdComponentState =
  createAtomComponentState<string | null>({
    key: 'objectOptionsDropdownExpandedRelationFieldIdComponentState',
    defaultValue: null,
    componentInstanceContext: ViewComponentInstanceContext,
  });
