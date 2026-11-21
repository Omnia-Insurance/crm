import { currentUserState } from '@/auth/states/currentUserState';
import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { isPendingServerSignOutState } from '@/auth/states/isPendingServerSignOutState';
import { lastAuthenticatedMethodState } from '@/auth/states/lastAuthenticatedMethodState';
import { resetStaleClientStateOnAppVersionChange } from '@/client-config/utils/resetStaleClientStateOnAppVersionChange';
import {
  METADATA_STORE_KEY_PREFIX,
  type MetadataStoreItem,
} from '@/metadata-store/states/metadataStoreState';
import {
  clearMetadataStoreStorage,
  metadataStoreStorage,
} from '@/metadata-store/storage/metadataStoreStorage';

jest.mock('@/metadata-store/storage/metadataStoreStorage', () => {
  const actual = jest.requireActual(
    '@/metadata-store/storage/metadataStoreStorage',
  );

  return {
    ...actual,
    clearMetadataStoreStorage: jest.fn(actual.clearMetadataStoreStorage),
  };
});

const CACHED_APP_VERSION_KEY = 'omnia.cachedAppVersion';

const METADATA_STORE_KEY = `${METADATA_STORE_KEY_PREFIX}objectMetadataItems`;

const PRESERVED_ENTRIES: Record<string, string> = {
  locale: '"fr-FR"',
  [isCookieAuthActiveState.key]: 'true',
  [isPendingServerSignOutState.key]: 'true',
  authSessionGeneration: 'session-generation',
  [lastAuthenticatedMethodState.key]: '"google"',
  [currentUserState.key]: '{"id":"user-id"}',
  [currentWorkspaceState.key]: '{"id":"workspace-id"}',
  [currentWorkspaceMemberState.key]: '{"id":"workspace-member-id"}',
  [currentUserWorkspaceState.key]: '{"permissionFlags":[]}',
};

const STALE_ENTRIES: Record<string, string> = {
  persistedColorSchemeState: '"Dark"',
  lastVisitedViewPerObjectMetadataItemState: '{}',
  tokenPairState: '{"accessOrWorkspaceAgnosticToken":{}}',
};

const ORPHAN_METADATA_ENTRIES: Record<string, string> = {
  [METADATA_STORE_KEY]: 'compressed-metadata',
  [`${METADATA_STORE_KEY_PREFIX}views`]: 'compressed-views',
};

const EMPTY_METADATA_STORE_ITEM: MetadataStoreItem = {
  current: [],
  draft: [],
  status: 'empty',
};

const seedLocalStorage = (entries: Record<string, string>) => {
  for (const [key, value] of Object.entries(entries)) {
    localStorage.setItem(key, value);
  }
};

const readLocalStorage = (): Record<string, string | null> =>
  Object.fromEntries(
    Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)]),
  );

describe('resetStaleClientStateOnAppVersionChange', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should do nothing without an app version', async () => {
    seedLocalStorage({ ...STALE_ENTRIES, [CACHED_APP_VERSION_KEY]: '2.6.1' });

    expect(await resetStaleClientStateOnAppVersionChange(undefined)).toBe(
      'unchanged',
    );
    expect(await resetStaleClientStateOnAppVersionChange('')).toBe('unchanged');
    expect(readLocalStorage()).toEqual({
      ...STALE_ENTRIES,
      [CACHED_APP_VERSION_KEY]: '2.6.1',
    });
    expect(clearMetadataStoreStorage).not.toHaveBeenCalled();
  });

  it('should do nothing when the app version is unchanged', async () => {
    seedLocalStorage({ ...STALE_ENTRIES, [CACHED_APP_VERSION_KEY]: '2.58.0' });

    expect(await resetStaleClientStateOnAppVersionChange('2.58.0')).toBe(
      'unchanged',
    );
    expect(readLocalStorage()).toEqual({
      ...STALE_ENTRIES,
      [CACHED_APP_VERSION_KEY]: '2.58.0',
    });
    expect(clearMetadataStoreStorage).not.toHaveBeenCalled();
  });

  it('should store the version on a first visit without wiping state', async () => {
    seedLocalStorage({
      ...PRESERVED_ENTRIES,
      ...STALE_ENTRIES,
      ...ORPHAN_METADATA_ENTRIES,
    });

    expect(await resetStaleClientStateOnAppVersionChange('2.58.0')).toBe(
      'first-visit',
    );
    expect(readLocalStorage()).toEqual({
      ...PRESERVED_ENTRIES,
      ...STALE_ENTRIES,
      [CACHED_APP_VERSION_KEY]: '2.58.0',
    });
    expect(clearMetadataStoreStorage).not.toHaveBeenCalled();
  });

  it('should keep only the preserve list when the app version changes', async () => {
    seedLocalStorage({
      ...PRESERVED_ENTRIES,
      ...STALE_ENTRIES,
      [CACHED_APP_VERSION_KEY]: '2.6.1',
    });

    expect(await resetStaleClientStateOnAppVersionChange('2.58.0')).toBe(
      'reset',
    );
    expect(readLocalStorage()).toEqual({
      ...PRESERVED_ENTRIES,
      [CACHED_APP_VERSION_KEY]: '2.58.0',
    });
  });

  it('should not reset toward an older version served during a rolling deploy', async () => {
    seedLocalStorage({
      ...PRESERVED_ENTRIES,
      ...STALE_ENTRIES,
      [CACHED_APP_VERSION_KEY]: '2.59.0',
    });

    expect(await resetStaleClientStateOnAppVersionChange('2.58.0')).toBe(
      'unchanged',
    );
    expect(readLocalStorage()).toEqual({
      ...PRESERVED_ENTRIES,
      ...STALE_ENTRIES,
      [CACHED_APP_VERSION_KEY]: '2.59.0',
    });
    expect(clearMetadataStoreStorage).not.toHaveBeenCalled();

    expect(await resetStaleClientStateOnAppVersionChange('2.59.0')).toBe(
      'unchanged',
    );
  });

  it('should still reset when a version cannot be compared', async () => {
    seedLocalStorage({ ...STALE_ENTRIES, [CACHED_APP_VERSION_KEY]: 'unknown' });

    expect(await resetStaleClientStateOnAppVersionChange('2.58.0')).toBe(
      'reset',
    );
    expect(localStorage.getItem(CACHED_APP_VERSION_KEY)).toBe('2.58.0');
  });

  it('should never drop a pending server sign-out', async () => {
    seedLocalStorage({
      [isPendingServerSignOutState.key]: 'true',
      [CACHED_APP_VERSION_KEY]: '2.6.1',
    });

    await resetStaleClientStateOnAppVersionChange('2.58.0');

    expect(localStorage.getItem(isPendingServerSignOutState.key)).toBe('true');
  });

  it('should remove orphan metadata store keys left by older bundles', async () => {
    seedLocalStorage({
      ...ORPHAN_METADATA_ENTRIES,
      [CACHED_APP_VERSION_KEY]: '2.6.1',
    });

    await resetStaleClientStateOnAppVersionChange('2.58.0');

    for (const orphanKey of Object.keys(ORPHAN_METADATA_ENTRIES)) {
      expect(localStorage.getItem(orphanKey)).toBeNull();
    }
  });

  it('should clear the metadata store when the app version changes', async () => {
    seedLocalStorage({ [CACHED_APP_VERSION_KEY]: '2.6.1' });
    metadataStoreStorage.setItem(METADATA_STORE_KEY, {
      current: [{ id: 'object-metadata-id' }],
      draft: [],
      status: 'up-to-date',
    });

    await resetStaleClientStateOnAppVersionChange('2.58.0');

    expect(clearMetadataStoreStorage).toHaveBeenCalledTimes(1);
    expect(
      metadataStoreStorage.getItem(
        METADATA_STORE_KEY,
        EMPTY_METADATA_STORE_ITEM,
      ),
    ).toEqual(EMPTY_METADATA_STORE_ITEM);
  });

  it('should wait for the metadata store to be cleared before resolving', async () => {
    seedLocalStorage({ [CACHED_APP_VERSION_KEY]: '2.6.1' });

    let resolveMetadataStoreClear: () => void = () => {};

    jest.mocked(clearMetadataStoreStorage).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveMetadataStoreClear = resolve;
        }),
    );

    let isSettled = false;

    const resultPromise = resetStaleClientStateOnAppVersionChange(
      '2.58.0',
    ).then((result) => {
      isSettled = true;

      return result;
    });

    await Promise.resolve();

    expect(isSettled).toBe(false);
    expect(localStorage.getItem(CACHED_APP_VERSION_KEY)).toBe('2.6.1');

    resolveMetadataStoreClear();

    expect(await resultPromise).toBe('reset');
    expect(localStorage.getItem(CACHED_APP_VERSION_KEY)).toBe('2.58.0');
  });

  it('should not ask for a reload when the new version cannot be persisted', async () => {
    seedLocalStorage({ ...STALE_ENTRIES, [CACHED_APP_VERSION_KEY]: '2.6.1' });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage is read-only');
    });

    expect(await resetStaleClientStateOnAppVersionChange('2.58.0')).toBe(
      'unchanged',
    );
  });

  it('should do nothing when storage is unavailable', async () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage is unavailable');
    });

    expect(await resetStaleClientStateOnAppVersionChange('2.58.0')).toBe(
      'unchanged',
    );
    expect(clearMetadataStoreStorage).not.toHaveBeenCalled();
  });
});
