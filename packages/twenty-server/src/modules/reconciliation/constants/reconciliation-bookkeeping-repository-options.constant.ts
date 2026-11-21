import { type WorkspaceRepositoryOptions } from 'src/engine/twenty-orm/types/workspace-repository-options.type';

// Writes to the admin-only reconciliation objects emit no events: a timeline activity would keep the written
// carrier book-of-business values where every role can read them, and webhooks would send them out
export const RECONCILIATION_BOOKKEEPING_REPOSITORY_OPTIONS: WorkspaceRepositoryOptions =
  {
    shouldSkipEventEmission: true,
  };
