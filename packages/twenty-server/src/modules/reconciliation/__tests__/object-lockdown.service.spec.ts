// OMNIA-CUSTOM: regression test for the reconciliation admin-only lockdown
// (audit 2026-06-10, finding: roles created after the seed command ran got
// default object permissions, silently bypassing the lockdown).

import { Logger } from '@nestjs/common';

import { type Repository } from 'typeorm';

import { type ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { type ObjectPermissionEntity } from 'src/engine/metadata-modules/object-permission/object-permission.entity';
import { type ObjectPermissionService } from 'src/engine/metadata-modules/object-permission/object-permission.service';
import { type RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import {
  RECONCILIATION_ADMIN_ONLY_OBJECT_NAMES,
  ReconciliationObjectLockdownService,
} from 'src/modules/reconciliation/services/object-lockdown.service';

const WORKSPACE_ID = 'workspace-id';

const RECONCILIATION_OBJECTS = RECONCILIATION_ADMIN_ONLY_OBJECT_NAMES.map(
  (nameSingular, index) =>
    ({
      id: `object-${index}`,
      nameSingular,
    }) as ObjectMetadataEntity,
);

const ADMIN_ROLE = { id: 'admin-role-id', label: 'Admin' } as RoleEntity;
const AGENT_ROLE = { id: 'agent-role-id', label: 'Agent' } as RoleEntity;

const buildDenyPermission = (objectMetadataId: string) => ({
  objectMetadataId,
  canReadObjectRecords: false,
  canUpdateObjectRecords: false,
  canSoftDeleteObjectRecords: false,
  canDestroyObjectRecords: false,
  showInSidebar: false,
  editWindowMinutes: null,
});

describe('ReconciliationObjectLockdownService', () => {
  let objectMetadataRepository: { find: jest.Mock };
  let roleRepository: { find: jest.Mock; findOne: jest.Mock };
  let objectPermissionRepository: { find: jest.Mock };
  let objectPermissionService: { upsertObjectPermissions: jest.Mock };
  let service: ReconciliationObjectLockdownService;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    objectMetadataRepository = {
      // Query-aware: the system-object lookup (isSystem: true) finds none by
      // default; findAdminOnlyObjects (nameSingular In) returns the recon objects.
      find: jest
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(
            where?.isSystem === true ? [] : RECONCILIATION_OBJECTS,
          ),
        ),
    };
    roleRepository = {
      find: jest.fn().mockResolvedValue([ADMIN_ROLE, AGENT_ROLE]),
      findOne: jest.fn().mockResolvedValue(AGENT_ROLE),
    };
    objectPermissionRepository = {
      find: jest.fn().mockResolvedValue([]),
    };
    objectPermissionService = {
      upsertObjectPermissions: jest.fn().mockResolvedValue([]),
    };

    service = new ReconciliationObjectLockdownService(
      objectMetadataRepository as unknown as Repository<ObjectMetadataEntity>,
      roleRepository as unknown as Repository<RoleEntity>,
      objectPermissionRepository as unknown as Repository<ObjectPermissionEntity>,
      objectPermissionService as unknown as ObjectPermissionService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('applyToRole', () => {
    it('should write deny rows for every reconciliation object when a non-admin role is created', async () => {
      await service.applyToRole({
        workspaceId: WORKSPACE_ID,
        roleId: AGENT_ROLE.id,
      });

      expect(
        objectPermissionService.upsertObjectPermissions,
      ).toHaveBeenCalledWith({
        workspaceId: WORKSPACE_ID,
        input: {
          roleId: AGENT_ROLE.id,
          objectPermissions: RECONCILIATION_OBJECTS.map((objectMetadata) =>
            buildDenyPermission(objectMetadata.id),
          ),
        },
      });
    });

    it('should preserve permissions on unrelated objects while overwriting stale reconciliation grants', async () => {
      const unrelatedPermission = {
        objectMetadataId: 'unrelated-object-id',
        canReadObjectRecords: true,
        canUpdateObjectRecords: true,
        canSoftDeleteObjectRecords: false,
        canDestroyObjectRecords: false,
        showInSidebar: true,
        editWindowMinutes: 30,
      };
      // Stale allow row on a reconciliation object must be replaced by a deny
      const staleReconciliationGrant = {
        objectMetadataId: RECONCILIATION_OBJECTS[0].id,
        canReadObjectRecords: true,
        canUpdateObjectRecords: true,
        canSoftDeleteObjectRecords: true,
        canDestroyObjectRecords: true,
        showInSidebar: true,
        editWindowMinutes: null,
      };

      objectPermissionRepository.find.mockResolvedValue([
        unrelatedPermission,
        staleReconciliationGrant,
      ]);

      await service.applyToRole({
        workspaceId: WORKSPACE_ID,
        roleId: AGENT_ROLE.id,
      });

      const { input } =
        objectPermissionService.upsertObjectPermissions.mock.calls[0][0];

      expect(input.objectPermissions).toContainEqual(unrelatedPermission);
      expect(input.objectPermissions).toContainEqual(
        buildDenyPermission(RECONCILIATION_OBJECTS[0].id),
      );
      expect(input.objectPermissions).not.toContainEqual(
        staleReconciliationGrant,
      );
    });

    it('should skip the upsert when every reconciliation object is already denied (idempotent re-run)', async () => {
      objectPermissionRepository.find.mockResolvedValue(
        RECONCILIATION_OBJECTS.map((objectMetadata) =>
          buildDenyPermission(objectMetadata.id),
        ),
      );

      await service.applyToRole({
        workspaceId: WORKSPACE_ID,
        roleId: AGENT_ROLE.id,
      });

      expect(
        objectPermissionService.upsertObjectPermissions,
      ).not.toHaveBeenCalled();
    });

    it('should skip (with a warning) a not-yet-locked role that holds permissions on a system object', async () => {
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      // The role's only existing permission is on a system object; upsert
      // would either reject it (platform-managed) or delete it, so the
      // lockdown must skip rather than corrupt the role.
      objectPermissionRepository.find.mockResolvedValue([
        {
          objectMetadataId: 'system-object-id',
          canReadObjectRecords: true,
          canUpdateObjectRecords: false,
          canSoftDeleteObjectRecords: false,
          canDestroyObjectRecords: false,
          showInSidebar: true,
          editWindowMinutes: null,
        },
      ]);
      objectMetadataRepository.find.mockImplementation(({ where }) =>
        Promise.resolve(
          where?.isSystem === true
            ? [{ id: 'system-object-id' } as ObjectMetadataEntity]
            : RECONCILIATION_OBJECTS,
        ),
      );

      await service.applyToRole({
        workspaceId: WORKSPACE_ID,
        roleId: AGENT_ROLE.id,
      });

      expect(
        objectPermissionService.upsertObjectPermissions,
      ).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    });

    it('should not touch permissions for the admin role', async () => {
      roleRepository.findOne.mockResolvedValue(ADMIN_ROLE);

      await service.applyToRole({
        workspaceId: WORKSPACE_ID,
        roleId: ADMIN_ROLE.id,
      });

      expect(
        objectPermissionService.upsertObjectPermissions,
      ).not.toHaveBeenCalled();
    });

    it('should no-op when the reconciliation objects are not seeded in the workspace', async () => {
      objectMetadataRepository.find.mockResolvedValue([]);

      await service.applyToRole({
        workspaceId: WORKSPACE_ID,
        roleId: AGENT_ROLE.id,
      });

      expect(
        objectPermissionService.upsertObjectPermissions,
      ).not.toHaveBeenCalled();
    });
  });

  describe('applyToAllNonAdminRoles', () => {
    it('should lock every non-admin role and skip the admin role', async () => {
      const result = await service.applyToAllNonAdminRoles({
        workspaceId: WORKSPACE_ID,
      });

      expect(result).toEqual({
        objectCount: RECONCILIATION_OBJECTS.length,
        lockedRoleLabels: [AGENT_ROLE.label],
      });
      expect(
        objectPermissionService.upsertObjectPermissions,
      ).toHaveBeenCalledTimes(1);
      expect(
        objectPermissionService.upsertObjectPermissions,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({ roleId: AGENT_ROLE.id }),
        }),
      );
    });

    it('should report without writing when dryRun is set', async () => {
      const result = await service.applyToAllNonAdminRoles({
        workspaceId: WORKSPACE_ID,
        dryRun: true,
      });

      expect(result).toEqual({
        objectCount: RECONCILIATION_OBJECTS.length,
        lockedRoleLabels: [AGENT_ROLE.label],
      });
      expect(
        objectPermissionService.upsertObjectPermissions,
      ).not.toHaveBeenCalled();
    });

    it('should report zero objects when the reconciliation objects are not seeded', async () => {
      objectMetadataRepository.find.mockResolvedValue([]);

      const result = await service.applyToAllNonAdminRoles({
        workspaceId: WORKSPACE_ID,
      });

      expect(result).toEqual({ objectCount: 0, lockedRoleLabels: [] });
      expect(
        objectPermissionService.upsertObjectPermissions,
      ).not.toHaveBeenCalled();
    });
  });
});
