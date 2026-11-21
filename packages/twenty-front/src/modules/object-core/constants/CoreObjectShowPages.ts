import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { StandardObjectNameSingular } from 'twenty-shared/types';

import { type CoreObjectShowPageProps } from '@/object-core/types/CoreObjectShowPageProps';

type CoreObjectShowPageComponent = LazyExoticComponent<
  ComponentType<CoreObjectShowPageProps>
>;

// OMNIA-CUSTOM: string keys so a workspace object (reconciliation) can register its page
export const CORE_OBJECT_SHOW_PAGES: ReadonlyMap<
  string,
  CoreObjectShowPageComponent
> = new Map<string, CoreObjectShowPageComponent>([
  [
    StandardObjectNameSingular.Workflow,
    lazy(() =>
      import('~/pages/object-core/WorkflowCoreObjectShowPage').then(
        (module) => ({
          default: module.WorkflowCoreObjectShowPage,
        }),
      ),
    ),
  ],
  // OMNIA-CUSTOM: the reconciliation review page replaces the default record page
  [
    'reconciliation',
    lazy(() =>
      import('@/reconciliation/components/ReconciliationReviewPage').then(
        (module) => ({
          default: module.ReconciliationReviewPage,
        }),
      ),
    ),
  ],
]);
