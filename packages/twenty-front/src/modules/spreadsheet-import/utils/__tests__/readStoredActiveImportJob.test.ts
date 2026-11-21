import { ACTIVE_IMPORT_JOB_STORAGE_KEY } from '@/spreadsheet-import/constants/ActiveImportJobStorageKey';
import { readStoredActiveImportJob } from '@/spreadsheet-import/utils/readStoredActiveImportJob';
import { writeStoredActiveImportJob } from '@/spreadsheet-import/utils/writeStoredActiveImportJob';

const ACTIVE_IMPORT_JOB = {
  importJobId: '0f4b6b1e-5d4a-4a8e-9b0e-2f3c4d5e6f70',
  objectNameSingular: 'company',
  totalRecords: 2,
};

describe('readStoredActiveImportJob', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('should read back the job written by writeStoredActiveImportJob', () => {
    writeStoredActiveImportJob(ACTIVE_IMPORT_JOB);

    expect(readStoredActiveImportJob()).toEqual(ACTIVE_IMPORT_JOB);
  });

  it('should store nothing but the job id, object and row count', () => {
    writeStoredActiveImportJob({
      ...ACTIVE_IMPORT_JOB,
      fileName: 'policies.csv',
    } as typeof ACTIVE_IMPORT_JOB);

    expect(
      JSON.parse(localStorage.getItem(ACTIVE_IMPORT_JOB_STORAGE_KEY) ?? ''),
    ).toEqual(ACTIVE_IMPORT_JOB);
  });

  it('should remove the stored job when given null', () => {
    writeStoredActiveImportJob(ACTIVE_IMPORT_JOB);
    writeStoredActiveImportJob(null);

    expect(localStorage.getItem(ACTIVE_IMPORT_JOB_STORAGE_KEY)).toBeNull();
    expect(readStoredActiveImportJob()).toBeNull();
  });

  it('should return null for a value that is not valid JSON', () => {
    localStorage.setItem(ACTIVE_IMPORT_JOB_STORAGE_KEY, '{not json');

    expect(readStoredActiveImportJob()).toBeNull();
  });

  it('should return null for a stored value with the wrong shape', () => {
    localStorage.setItem(
      ACTIVE_IMPORT_JOB_STORAGE_KEY,
      JSON.stringify({ importJobId: ACTIVE_IMPORT_JOB.importJobId }),
    );

    expect(readStoredActiveImportJob()).toBeNull();
  });
});
