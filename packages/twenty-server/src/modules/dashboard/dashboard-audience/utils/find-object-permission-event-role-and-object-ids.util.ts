import { isNonEmptyString } from '@sniptt/guards';
import { isPlainObject } from 'twenty-shared/utils';

import { type MetadataEvent } from 'src/engine/workspace-manager/workspace-migration/workspace-migration-runner/types/metadata-event.type';

type RoleAndObjectIds = { roleId: string; objectMetadataId: string };

const findRoleAndObjectIds = (scalarFlatEntity: unknown): RoleAndObjectIds[] =>
  isPlainObject(scalarFlatEntity) &&
  isNonEmptyString(scalarFlatEntity.roleId) &&
  isNonEmptyString(scalarFlatEntity.objectMetadataId)
    ? [
        {
          roleId: scalarFlatEntity.roleId,
          objectMetadataId: scalarFlatEntity.objectMetadataId,
        },
      ]
    : [];

// Both sides of an update count: moving a row off the dashboard object changes the dashboard grants too
export const findObjectPermissionEventRoleAndObjectIds = (
  events: MetadataEvent[],
): RoleAndObjectIds[] =>
  events
    .filter(({ metadataName }) => metadataName === 'objectPermission')
    .flatMap(({ properties }) => [
      ...('before' in properties
        ? findRoleAndObjectIds(properties.before)
        : []),
      ...('after' in properties ? findRoleAndObjectIds(properties.after) : []),
    ]);
