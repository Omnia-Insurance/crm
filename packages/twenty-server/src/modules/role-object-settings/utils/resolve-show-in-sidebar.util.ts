import { STANDARD_OBJECTS } from 'twenty-shared/metadata';

import { type FlatObjectMetadata } from 'src/engine/metadata-modules/flat-object-metadata/types/flat-object-metadata.type';
import { type FlatObjectPermission } from 'src/engine/metadata-modules/flat-object-permission/types/flat-object-permission.type';
import { type FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';
import { LEGACY_WORKSPACE_WORKFLOW_OBJECT_UNIVERSAL_IDENTIFIER } from 'src/modules/workflow/common/constants/legacy-workspace-workflow-object-universal-identifiers.constant';

// The objects compute-role-records-permissions gates on the WORKFLOWS flag; checked
// before isSystem because workflowRun and workflowVersion are system objects
const WORKFLOW_OBJECT_UNIVERSAL_IDENTIFIERS: string[] = [
  LEGACY_WORKSPACE_WORKFLOW_OBJECT_UNIVERSAL_IDENTIFIER,
  STANDARD_OBJECTS.workflowRun.universalIdentifier,
  STANDARD_OBJECTS.workflowVersion.universalIdentifier,
];

export const resolveShowInSidebar = ({
  flatObjectMetadata,
  flatRole,
  flatObjectPermission,
  isWorkflowsPermissionGranted,
}: {
  flatObjectMetadata: FlatObjectMetadata;
  flatRole: FlatRole;
  flatObjectPermission?: FlatObjectPermission;
  isWorkflowsPermissionGranted: boolean;
}): boolean => {
  if (
    WORKFLOW_OBJECT_UNIVERSAL_IDENTIFIERS.includes(
      flatObjectMetadata.universalIdentifier,
    )
  ) {
    return isWorkflowsPermissionGranted;
  }

  if (flatObjectMetadata.isSystem) {
    return true;
  }

  return (
    flatObjectPermission?.showInSidebar ?? flatRole.showAllObjectsInSidebar
  );
};
