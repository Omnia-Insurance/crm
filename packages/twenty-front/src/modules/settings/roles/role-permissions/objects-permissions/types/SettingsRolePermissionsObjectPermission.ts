import { type ReactNode } from 'react';
import { type OmniaObjectPermission } from '@/settings/roles/types/OmniaRoleExtensions';

export type SettingsRolePermissionsObjectPermission = {
  key: keyof Pick<
    OmniaObjectPermission,
    | 'canDestroyObjectRecords'
    | 'canReadObjectRecords'
    | 'canSoftDeleteObjectRecords'
    | 'canUpdateObjectRecords'
  >;
  label: string | ReactNode;
  value?: boolean;
  grantedBy?: number;
  revokedBy?: number;
  setValue: (newValue: boolean) => void;
};

export type SettingsRolePermissionsObjectLevelPermission = {
  key: keyof Pick<
    OmniaObjectPermission,
    | 'canDestroyObjectRecords'
    | 'canReadObjectRecords'
    | 'canSoftDeleteObjectRecords'
    | 'canUpdateObjectRecords'
    | 'showInSidebar'
  >;
  label: string | ReactNode;
  value?: boolean | null;
};
