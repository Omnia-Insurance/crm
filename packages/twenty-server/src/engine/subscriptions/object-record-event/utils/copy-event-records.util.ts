import { type ObjectRecordEvent } from 'twenty-shared/database-events';
import { type Nullable, type ObjectRecord } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

// Relation enrichment only writes top-level relation and join column keys, so shallow copies isolate it
export const copyEventRecords = <TEvent extends ObjectRecordEvent>(
  event: TEvent,
): TEvent => {
  const { before, after } = event.properties as {
    before?: Nullable<ObjectRecord>;
    after?: Nullable<ObjectRecord>;
  };

  return {
    ...event,
    properties: {
      ...event.properties,
      ...(isDefined(before) && { before: { ...before } }),
      ...(isDefined(after) && { after: { ...after } }),
    },
  };
};
