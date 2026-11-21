import { clearSessionLocalStorageKeys } from '@/auth/utils/clearSessionLocalStorageKeys';
import { ACTIVE_IMPORT_JOB_STORAGE_KEY } from '@/spreadsheet-import/constants/ActiveImportJobStorageKey';

describe('clearSessionLocalStorageKeys', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should clear the active import job so the next user cannot re-attach to it', () => {
    localStorage.setItem(
      ACTIVE_IMPORT_JOB_STORAGE_KEY,
      '{"importJobId":"import-job-id","objectNameSingular":"person","totalRecords":3}',
    );

    clearSessionLocalStorageKeys();

    expect(localStorage.getItem(ACTIVE_IMPORT_JOB_STORAGE_KEY)).toBeNull();
  });

  it('should clear the persisted session state and keep unrelated keys', () => {
    localStorage.setItem('currentUserState', '{"id":"user-id"}');
    localStorage.setItem('currentUserWorkspaceState', '{}');
    localStorage.setItem('persistedColorSchemeState', '"Dark"');

    clearSessionLocalStorageKeys();

    expect(localStorage.getItem('currentUserState')).toBeNull();
    expect(localStorage.getItem('currentUserWorkspaceState')).toBeNull();
    expect(localStorage.getItem('persistedColorSchemeState')).toBe('"Dark"');
  });
});
