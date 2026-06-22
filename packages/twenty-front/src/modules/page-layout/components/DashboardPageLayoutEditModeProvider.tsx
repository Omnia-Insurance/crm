import { PageLayoutEditModeProviderContext } from '@/page-layout/contexts/PageLayoutEditModeContext';
import { useIsDashboardPageLayoutInEditMode } from '@/page-layout/hooks/useIsDashboardPageLayoutInEditMode';
import { useHasPermissionFlag } from '@/settings/roles/hooks/useHasPermissionFlag';
import { type ReactNode } from 'react';
import { PermissionFlagType } from '~/generated-metadata/graphql';

type DashboardPageLayoutEditModeProviderProps = {
  pageLayoutId: string;
  children: ReactNode;
};

export const DashboardPageLayoutEditModeProvider = ({
  pageLayoutId,
  children,
}: DashboardPageLayoutEditModeProviderProps) => {
  const isInEditModeFromState =
    useIsDashboardPageLayoutInEditMode(pageLayoutId);

  // OMNIA-CUSTOM: editing a dashboard requires the LAYOUTS permission flag — the
  // same flag the backend page-layout-widget mutations enforce. Without it,
  // force read-only so view-only roles never see (non-functional) edit
  // affordances like "Add Widget", the edit grid, or widget action menus.
  const hasLayoutsPermission = useHasPermissionFlag(PermissionFlagType.LAYOUTS);

  const isInEditMode = isInEditModeFromState && hasLayoutsPermission;

  return (
    <PageLayoutEditModeProviderContext value={{ isInEditMode }}>
      {children}
    </PageLayoutEditModeProviderContext>
  );
};
