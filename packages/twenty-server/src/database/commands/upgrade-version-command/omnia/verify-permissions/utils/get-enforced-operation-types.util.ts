import {
  type FeatureFlagKey,
  type ObjectRecordsOperationType,
} from 'twenty-shared/types';

import { getEnforcedOperationType } from 'src/engine/permissions/internal/role/utils/get-enforced-operation-type.util';

// Create is enforced as update while create permissions are off, so both collapse into one checked operation
export const getEnforcedOperationTypes = ({
  operationTypes,
  featureFlagsMap,
}: {
  operationTypes: ObjectRecordsOperationType[];
  featureFlagsMap: Partial<Record<FeatureFlagKey, boolean>>;
}): ObjectRecordsOperationType[] => [
  ...new Set(
    operationTypes.map((operationType) =>
      getEnforcedOperationType({ operationType, featureFlagsMap }),
    ),
  ),
];
