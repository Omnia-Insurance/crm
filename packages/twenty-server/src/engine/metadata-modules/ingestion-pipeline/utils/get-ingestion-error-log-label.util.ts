import { TwentyOrmException } from 'src/engine/twenty-orm/exceptions/twenty-orm.exception';

// ORM messages can echo the rejected value (invalid input syntax for type x: "<value>"), so logs keep only the code
export const getIngestionErrorLogLabel = (error: unknown): string => {
  if (error instanceof TwentyOrmException) {
    return error.code;
  }

  return error instanceof Error ? error.message : 'Unknown error';
};
