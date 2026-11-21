import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';
import { type ObjectRecordsPermissions } from 'twenty-shared/types';
import {
  type ObjectSidebarVisibility,
  type UserWorkspace,
} from '~/generated-metadata/graphql';

export type CurrentUserWorkspace = Pick<
  UserWorkspace,
  'permissionFlags' | 'twoFactorAuthenticationMethodSummary' | 'isImpersonating'
> & {
  objectRecordsPermissions: (ObjectRecordsPermissions & {
    objectMetadataId: string;
    // TODO(@charlesBochet): remove with its fragment selection and fallback once values persisted before 2.57 are gone
    restrictedFields?: Record<
      string,
      { canRead?: boolean | null; canUpdate?: boolean | null }
    >;
  })[];
  // OMNIA-CUSTOM: role-driven sidebar visibility (contract C4). Undefined means not loaded,
  // including values persisted before the field existed; never default it to [].
  objectSidebarVisibility?: Pick<
    ObjectSidebarVisibility,
    'objectMetadataId' | 'showInSidebar'
  >[];
};

export const currentUserWorkspaceState =
  createAtomState<CurrentUserWorkspace | null>({
    key: 'currentUserWorkspaceState',
    defaultValue: null,
    useLocalStorage: true,
    localStorageOptions: { getOnInit: true },
  });
