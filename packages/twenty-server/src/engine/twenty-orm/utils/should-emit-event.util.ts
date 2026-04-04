import { type DatabaseEventAction } from 'src/engine/api/graphql/graphql-query-runner/enums/database-event-action';
import { type EventEmissionPolicy } from 'src/engine/twenty-orm/types/event-emission-policy.type';

export const shouldEmitEvent = (
  policy: EventEmissionPolicy | undefined,
  action: DatabaseEventAction,
): boolean => {
  if (!policy?.allowedActions) return true;

  return policy.allowedActions.includes(action);
};
