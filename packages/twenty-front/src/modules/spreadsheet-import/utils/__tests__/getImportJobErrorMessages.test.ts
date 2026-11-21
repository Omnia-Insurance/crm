import { getImportJobErrorMessages } from '@/spreadsheet-import/utils/getImportJobErrorMessages';

describe('getImportJobErrorMessages', () => {
  it('should return no messages when the job has no result', () => {
    expect(getImportJobErrorMessages(null)).toEqual([]);
  });

  it('should return no messages when the result has no errors', () => {
    expect(
      getImportJobErrorMessages({ phase: 'Importing records...' }),
    ).toEqual([]);
  });

  it('should prefer the relation message, then the batch error, then a fallback', () => {
    expect(
      getImportJobErrorMessages({
        errors: [
          { message: 'No carrier matches row 3', error: 'NOT_FOUND' },
          { error: '2 records could not be updated.' },
          { message: '' },
        ],
      }),
    ).toEqual([
      'No carrier matches row 3',
      '2 records could not be updated.',
      'Unknown error',
    ]);
  });
});
