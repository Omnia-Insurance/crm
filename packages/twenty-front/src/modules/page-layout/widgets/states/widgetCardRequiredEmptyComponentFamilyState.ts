import { PageLayoutComponentInstanceContext } from '@/page-layout/states/contexts/PageLayoutComponentInstanceContext';
import { createAtomComponentFamilyState } from '@/ui/utilities/state/jotai/utils/createAtomComponentFamilyState';

export const widgetCardRequiredEmptyComponentFamilyState =
  createAtomComponentFamilyState<boolean, string>({
    key: 'widgetCardRequiredEmptyComponentFamilyState',
    defaultValue: false,
    componentInstanceContext: PageLayoutComponentInstanceContext,
  });
