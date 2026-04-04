import { type EventEmissionPolicy } from 'src/engine/twenty-orm/types/event-emission-policy.type';

export type ExecuteInWorkspaceContextOptions = {
  lite?: boolean;
  eventEmissionPolicy?: EventEmissionPolicy;
};
