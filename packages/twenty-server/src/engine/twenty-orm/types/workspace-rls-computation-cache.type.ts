import {
  type RecordGqlOperationFilter,
  type RowLevelPermissionPredicateValue,
} from 'twenty-shared/types';

export type WorkspaceRlsComputationCache = {
  recordFiltersByKey: Map<string, Promise<RecordGqlOperationFilter | null>>;
  relationValuesByKey: Map<
    string,
    Promise<RowLevelPermissionPredicateValue | null>
  >;
};

export const createWorkspaceRlsComputationCache =
  (): WorkspaceRlsComputationCache => ({
    recordFiltersByKey: new Map(),
    relationValuesByKey: new Map(),
  });
