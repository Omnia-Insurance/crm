// OMNIA-CUSTOM: Payment Reconciliation v2 — admin-only lockdown for the
// reconciliation workspace objects. Single source of truth shared by the
// seed command (locks every existing role at seed time) and RoleService
// (locks each newly created role), so roles created after seeding cannot
// see the reconciliation pipeline either (audit 2026-06-10). Idempotent;
// safe to re-run.

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { isDefined } from 'twenty-shared/utils';
import { In, Repository } from 'typeorm';

import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { ObjectPermissionEntity } from 'src/engine/metadata-modules/object-permission/object-permission.entity';
import { ObjectPermissionService } from 'src/engine/metadata-modules/object-permission/object-permission.service';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';

// Upstream dropped its ADMIN_ROLE_LABEL constant; the standard admin role is
// still created with this label (see create-standard-flat-role-metadata.util).
export const ADMIN_ROLE_LABEL = 'Admin';

// All Omnia reconciliation objects that should be admin-only.
export const RECONCILIATION_ADMIN_ONLY_OBJECT_NAMES = [
  'reconciliation',
  'carrierConfig',
  'reviewItem',
  'reconciliationDecisionRule',
];

@Injectable()
export class ReconciliationObjectLockdownService {
  private readonly logger = new Logger(
    ReconciliationObjectLockdownService.name,
  );

  constructor(
    @InjectRepository(ObjectMetadataEntity)
    private readonly objectMetadataRepository: Repository<ObjectMetadataEntity>,
    @InjectRepository(RoleEntity)
    private readonly roleRepository: Repository<RoleEntity>,
    @InjectRepository(ObjectPermissionEntity)
    private readonly objectPermissionRepository: Repository<ObjectPermissionEntity>,
    private readonly objectPermissionService: ObjectPermissionService,
  ) {}

  // Deny read/write on the reconciliation objects for a single role. No-op
  // for the admin role and for workspaces where the objects are not seeded.
  public async applyToRole({
    workspaceId,
    roleId,
  }: {
    workspaceId: string;
    roleId: string;
  }): Promise<void> {
    const role = await this.roleRepository.findOne({
      where: { id: roleId, workspaceId },
    });

    if (!isDefined(role) || role.label === ADMIN_ROLE_LABEL) {
      return;
    }

    const adminOnlyObjects = await this.findAdminOnlyObjects(workspaceId);

    if (adminOnlyObjects.length === 0) {
      return;
    }

    await this.applyDenyPermissions({ workspaceId, role, adminOnlyObjects });
  }

  // Deny read/write on the reconciliation objects for every non-admin role
  // in the workspace. Returns what was (or with dryRun, would be) locked.
  public async applyToAllNonAdminRoles({
    workspaceId,
    dryRun = false,
  }: {
    workspaceId: string;
    dryRun?: boolean;
  }): Promise<{ objectCount: number; lockedRoleLabels: string[] }> {
    const adminOnlyObjects = await this.findAdminOnlyObjects(workspaceId);

    if (adminOnlyObjects.length === 0) {
      return { objectCount: 0, lockedRoleLabels: [] };
    }

    const roles = await this.roleRepository.find({ where: { workspaceId } });
    const nonAdminRoles = roles.filter(
      (role) => role.label !== ADMIN_ROLE_LABEL,
    );

    if (!dryRun) {
      for (const role of nonAdminRoles) {
        await this.applyDenyPermissions({
          workspaceId,
          role,
          adminOnlyObjects,
        });
      }
    }

    return {
      objectCount: adminOnlyObjects.length,
      lockedRoleLabels: nonAdminRoles.map((role) => role.label),
    };
  }

  private async findAdminOnlyObjects(
    workspaceId: string,
  ): Promise<ObjectMetadataEntity[]> {
    return this.objectMetadataRepository.find({
      where: {
        workspaceId,
        nameSingular: In(RECONCILIATION_ADMIN_ONLY_OBJECT_NAMES),
      },
    });
  }

  private async applyDenyPermissions({
    workspaceId,
    role,
    adminOnlyObjects,
  }: {
    workspaceId: string;
    role: RoleEntity;
    adminOnlyObjects: ObjectMetadataEntity[];
  }): Promise<void> {
    // upsertObjectPermissions deletes any permission row for the role that is
    // missing from the input, so rows on unrelated objects must be re-sent.
    const existingObjectPermissions =
      await this.objectPermissionRepository.find({
        where: { roleId: role.id, workspaceId },
      });

    const adminOnlyObjectMetadataIds = new Set(
      adminOnlyObjects.map((objectMetadata) => objectMetadata.id),
    );

    const preservedObjectPermissions = existingObjectPermissions
      .filter(
        (permission) =>
          !adminOnlyObjectMetadataIds.has(permission.objectMetadataId),
      )
      .map((permission) => ({
        objectMetadataId: permission.objectMetadataId,
        canReadObjectRecords: permission.canReadObjectRecords,
        canUpdateObjectRecords: permission.canUpdateObjectRecords,
        canSoftDeleteObjectRecords: permission.canSoftDeleteObjectRecords,
        canDestroyObjectRecords: permission.canDestroyObjectRecords,
        showInSidebar: permission.showInSidebar,
        editWindowMinutes: permission.editWindowMinutes,
      }));

    const adminOnlyDenyPermissions = adminOnlyObjects.map((objectMetadata) => ({
      objectMetadataId: objectMetadata.id,
      canReadObjectRecords: false,
      canUpdateObjectRecords: false,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
      showInSidebar: false,
      editWindowMinutes: null,
    }));

    await this.objectPermissionService.upsertObjectPermissions({
      workspaceId,
      input: {
        roleId: role.id,
        objectPermissions: [
          ...preservedObjectPermissions,
          ...adminOnlyDenyPermissions,
        ],
      },
    });

    this.logger.log(
      `Locked ${adminOnlyObjects.length} reconciliation object(s) from role "${role.label}" in workspace ${workspaceId}`,
    );
  }
}
