import { isNonEmptyString, isNull, isUndefined } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { currentUserState } from '@/auth/states/currentUserState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { isPendingServerSignOutState } from '@/auth/states/isPendingServerSignOutState';
import { lastAuthenticatedMethodState } from '@/auth/states/lastAuthenticatedMethodState';
import { safeRemoveLocalStorageItems } from '@/auth/utils/safeRemoveLocalStorageItems';
import { METADATA_STORE_KEY_PREFIX } from '@/metadata-store/states/metadataStoreState';
import { clearMetadataStoreStorage } from '@/metadata-store/storage/metadataStoreStorage';
import { isNewerSemver } from '@/settings/applications/utils/isNewerSemver';

type AppVersionChangeResult = 'unchanged' | 'first-visit' | 'reset';

const CACHED_APP_VERSION_LOCAL_STORAGE_KEY = 'omnia.cachedAppVersion';

// Not exported by sessionGenerationStore.ts; check-customizations.sh guards the literal there.
const SESSION_GENERATION_LOCAL_STORAGE_KEY = 'authSessionGeneration';

const PRESERVED_LOCAL_STORAGE_KEYS = new Set<string>([
  'locale',
  CACHED_APP_VERSION_LOCAL_STORAGE_KEY,
  isCookieAuthActiveState.key,
  // Dropping it would leave a signed-out session alive on the server (shared workstations).
  isPendingServerSignOutState.key,
  SESSION_GENERATION_LOCAL_STORAGE_KEY,
  lastAuthenticatedMethodState.key,
  // The persisted session snapshot: without currentWorkspaceState, PageChangeEffect
  // sends a signed-in user to /welcome until the current user reloads.
  currentUserState.key,
  currentWorkspaceState.key,
  currentWorkspaceMemberState.key,
  currentUserWorkspaceState.key,
]);

const getLocalStorageKeys = (): string[] => {
  try {
    return Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.key(index),
    ).filter(isDefined);
  } catch {
    return [];
  }
};

// undefined means storage is unavailable, null means nothing was cached yet.
const readCachedAppVersion = (): string | null | undefined => {
  try {
    return localStorage.getItem(CACHED_APP_VERSION_LOCAL_STORAGE_KEY);
  } catch {
    return undefined;
  }
};

const persistCachedAppVersion = (appVersion: string): boolean => {
  try {
    localStorage.setItem(CACHED_APP_VERSION_LOCAL_STORAGE_KEY, appVersion);

    return (
      localStorage.getItem(CACHED_APP_VERSION_LOCAL_STORAGE_KEY) === appVersion
    );
  } catch {
    return false;
  }
};

export const resetStaleClientStateOnAppVersionChange = async (
  appVersion?: string,
): Promise<AppVersionChangeResult> => {
  if (!isNonEmptyString(appVersion)) {
    return 'unchanged';
  }

  const cachedAppVersion = readCachedAppVersion();

  if (isUndefined(cachedAppVersion) || cachedAppVersion === appVersion) {
    return 'unchanged';
  }

  if (isNull(cachedAppVersion)) {
    // Metadata keys left in localStorage by pre-IndexedDB bundles are dead data nothing reads.
    safeRemoveLocalStorageItems(
      getLocalStorageKeys().filter((key) =>
        key.startsWith(METADATA_STORE_KEY_PREFIX),
      ),
    );
    persistCachedAppVersion(appVersion);

    return 'first-visit';
  }

  // A rolling deploy serves old and new pods side by side: resetting toward the older
  // one would bounce the browser between them. The newer version stays cached.
  if (isNewerSemver(cachedAppVersion, appVersion)) {
    return 'unchanged';
  }

  await clearMetadataStoreStorage();

  safeRemoveLocalStorageItems(
    getLocalStorageKeys().filter(
      (key) => !PRESERVED_LOCAL_STORAGE_KEYS.has(key),
    ),
  );

  // Without the new version persisted, every boot would reset and reload again.
  return persistCachedAppVersion(appVersion) ? 'reset' : 'unchanged';
};
