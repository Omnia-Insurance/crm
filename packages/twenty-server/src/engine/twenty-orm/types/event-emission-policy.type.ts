import { type DatabaseEventAction } from 'src/engine/api/graphql/graphql-query-runner/enums/database-event-action';

export type EventOrigin = 'api' | 'import' | 'system' | 'workflow';

export type EventEmissionPolicy = {
  /**
   * Which DatabaseEventActions to emit. If undefined, all actions
   * are emitted (default behavior — no breaking change).
   */
  allowedActions?: DatabaseEventAction[];

  /**
   * Origin tag propagated to WorkspaceEventBatch so downstream
   * listeners can adjust routing per origin.
   */
  origin?: EventOrigin;
};
