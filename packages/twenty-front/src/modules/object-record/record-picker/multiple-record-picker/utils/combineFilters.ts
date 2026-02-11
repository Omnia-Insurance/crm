import { isDefined } from 'twenty-shared/utils';
import { type ObjectRecordFilterInput } from '~/generated/graphql';

export const combineFilters = (
  filters: (ObjectRecordFilterInput | undefined)[],
): ObjectRecordFilterInput | undefined => {
  const defined = filters.filter(
    (f): f is ObjectRecordFilterInput => isDefined(f),
  );

  if (defined.length === 0) return undefined;
  if (defined.length === 1) return defined[0];

  return { and: defined };
};
