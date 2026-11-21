import { getIngestionErrorLogLabel } from 'src/engine/metadata-modules/ingestion-pipeline/utils/get-ingestion-error-log-label.util';
import {
  TwentyOrmException,
  TwentyOrmExceptionCode,
} from 'src/engine/twenty-orm/exceptions/twenty-orm.exception';

describe('getIngestionErrorLogLabel', () => {
  it('should keep only the code of an ORM error that echoes a record value', () => {
    const label = getIngestionErrorLogLabel(
      new TwentyOrmException(
        'invalid input syntax for type date: "1980-02-30"',
        TwentyOrmExceptionCode.INVALID_INPUT,
      ),
    );

    expect(label).toBe(TwentyOrmExceptionCode.INVALID_INPUT);
    expect(label).not.toContain('1980-02-30');
  });

  it('should keep the message of an ingestion error', () => {
    expect(
      getIngestionErrorLogLabel(new Error('Person save returned no record')),
    ).toBe('Person save returned no record');
  });

  it('should describe a non-error value generically', () => {
    expect(getIngestionErrorLogLabel('5551234567')).toBe('Unknown error');
  });
});
