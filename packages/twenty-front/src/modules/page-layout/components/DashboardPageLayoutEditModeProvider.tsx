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

  // OMNIA-CUSTOM: widget writes require LAYOUTS server-side, so without it the
  // dashboard stays read-only instead of showing edit controls that fail
  const hasLayoutsPermission = useHasPermissionFlag(PermissionFlagType.LAYOUTS);

  const isInEditMode = isInEditModeFromState && hasLayoutsPermission;

  return (
    <PageLayoutEditModeProviderContext value={{ isInEditMode }}>
      {children}
    </PageLayoutEditModeProviderContext>
  );
};
