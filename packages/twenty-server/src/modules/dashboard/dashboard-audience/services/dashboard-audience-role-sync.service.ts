import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import {
  FieldMetadataType,
  RowLevelPermissionPredicateOperand,
  RowLevelPermissionPredicateScope,
} from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { Repository } from 'typeorm';
import { v5 as uuidv5 } from 'uuid';

import { FieldMetadataEntity } from 'src/engine/metadata-modules/field-metadata/field-metadata.entity';
import { FieldMetadataService } from 'src/engine/metadata-modules/field-metadata/services/field-metadata.service';
import { type UpdateFieldInput } from 'src/engine/metadata-modules/field-metadata/dtos/update-field.input';
import { ObjectMetadataEntity } from 'src/engine/metadata-modules/object-metadata/object-metadata.entity';
import { RoleEntity } from 'src/engine/metadata-modules/role/role.entity';
import { RowLevelPermissionPredicateService } from 'src/engine/metadata-modules/row-level-permission-predicate/services/row-level-permission-predicate.service';

const DASHBOARD_OBJECT_NAME_SINGULAR = 'dashboard';
const AUDIENCE_FIELD_NAME = 'audience';

// Fixed namespace so per-role predicate ids are stable across runs/environments.
const PREDICATE_ID_NAMESPACE = '918276b7-d282-4785-9a77-9c0b8664267f';

// MULTI_SELECT option `value` must be (a) a valid GraphQL enum name and
// (b) UPPER_CASE snake_case (/^(?!.*__)[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/). A raw
// role UUID fails both (leading digit, hyphens, lowercase), so encode it as
// ROLE_<UPPERCASE-HEX>. The same token is used in the per-role predicate value,
// so it stays rename-proof (it keys on the role id, not its label).
const encodeRoleToken = (roleId: string): string =>
  `ROLE_${roleId.replace(/-/g, '').toUpperCase()}`;

const TAG_COLORS = [
  'green',
  'turquoise',
  'sky',
  'blue',
  'purple',
  'pink',
  'red',
  'orange',
  'yellow',
  'gray',
] as const;

const colorForRole = (roleId: string): string => {
  let hash = 0;

  for (let i = 0; i < roleId.length; i++) {
    hash = (hash + roleId.charCodeAt(i)) % TAG_COLORS.length;
  }

  return TAG_COLORS[hash];
};

const predicateIdForRole = (roleId: string, objectMetadataId: string): string =>
  uuidv5(`${roleId}:${objectMetadataId}:READ`, PREDICATE_ID_NAMESPACE);

type AudienceOption = {
  id?: string;
  value: string;
  label: string;
  position: number;
  color: string;
};

/**
 * Keeps the dashboard `audience` MULTI_SELECT field + its per-role row-level
 * READ predicates in sync with the workspace's roles. Idempotent: safe to call
 * repeatedly (driven both by the role-change event listener and the bootstrap
 * command).
 *
 * Gating model (RLS is fail-open per role):
 *   - "admin-like" roles (canUpdateAllSettings) -> no option, no predicate -> see all.
 *   - every other role -> one audience option + `audience CONTAINS '<token>'`
 *     READ predicate -> sees only dashboards tagged with that role.
 */
@Injectable()
export class DashboardAudienceRoleSyncService {
  private readonly logger = new Logger(DashboardAudienceRoleSyncService.name);

  constructor(
    @InjectRepository(ObjectMetadataEntity)
    private readonly objectMetadataRepository: Repository<ObjectMetadataEntity>,
    @InjectRepository(FieldMetadataEntity)
    private readonly fieldMetadataRepository: Repository<FieldMetadataEntity>,
    @InjectRepository(RoleEntity)
    private readonly roleRepository: Repository<RoleEntity>,
    private readonly fieldMetadataService: FieldMetadataService,
    private readonly rowLevelPermissionPredicateService: RowLevelPermissionPredicateService,
  ) {}

  async syncWorkspace(workspaceId: string): Promise<void> {
    const dashboardObject = await this.objectMetadataRepository.findOne({
      where: { workspaceId, nameSingular: DASHBOARD_OBJECT_NAME_SINGULAR },
    });

    if (!isDefined(dashboardObject)) {
      return;
    }

    const roles = await this.roleRepository.find({ where: { workspaceId } });
    // Admin-like roles see all dashboards (left predicate-free). Everyone else
    // is gated and gets an audience option + a predicate.
    const gatedRoles = roles.filter((role) => !role.canUpdateAllSettings);

    if (gatedRoles.length === 0) {
      return;
    }

    const desiredOptions: AudienceOption[] = gatedRoles.map((role, index) => ({
      value: encodeRoleToken(role.id),
      label: role.label,
      position: index,
      color: colorForRole(role.id),
    }));

    const fieldMetadataId = await this.ensureAudienceField({
      workspaceId,
      objectMetadataId: dashboardObject.id,
      desiredOptions,
    });

    if (!isDefined(fieldMetadataId)) {
      return;
    }

    for (const role of gatedRoles) {
      await this.upsertRolePredicate({
        workspaceId,
        roleId: role.id,
        objectMetadataId: dashboardObject.id,
        fieldMetadataId,
      });
    }
  }

  private async ensureAudienceField({
    workspaceId,
    objectMetadataId,
    desiredOptions,
  }: {
    workspaceId: string;
    objectMetadataId: string;
    desiredOptions: AudienceOption[];
  }): Promise<string | undefined> {
    const existingField = await this.fieldMetadataRepository.findOne({
      where: { workspaceId, objectMetadataId, name: AUDIENCE_FIELD_NAME },
    });

    if (!isDefined(existingField)) {
      await this.fieldMetadataService.createManyFields({
        createFieldInputs: [
          {
            objectMetadataId,
            type: FieldMetadataType.MULTI_SELECT,
            name: AUDIENCE_FIELD_NAME,
            label: 'Audience',
            description:
              'Roles allowed to view this dashboard. Empty = admins only. Auto-synced from workspace roles.',
            icon: 'IconUsers',
            isLabelSyncedWithName: false,
            options: desiredOptions,
          },
        ],
        workspaceId,
      });

      const createdField = await this.fieldMetadataRepository.findOne({
        where: { workspaceId, objectMetadataId, name: AUDIENCE_FIELD_NAME },
      });

      this.logger.log(
        `Created dashboard.audience field with ${desiredOptions.length} role option(s) for workspace ${workspaceId}`,
      );

      return createdField?.id;
    }

    const currentOptions = (existingField.options ??
      []) as unknown as AudienceOption[];

    // Preserve existing option ids for surviving role tokens so the underlying
    // Postgres enum stays stable; only the option set/labels/order change.
    const currentByValue = new Map(
      currentOptions.map((option) => [option.value, option]),
    );

    const mergedOptions: AudienceOption[] = desiredOptions.map((option) => {
      const previous = currentByValue.get(option.value);

      return isDefined(previous)
        ? {
            id: previous.id,
            value: option.value,
            label: option.label,
            position: option.position,
            color: previous.color ?? option.color,
          }
        : option;
    });

    if (!this.optionsAreEqual(currentOptions, mergedOptions)) {
      // MUST go through updateOneField (not a raw repo write) so the migration
      // runs ALTER TYPE ... on the per-field enum; raw JSON leaves it stale and
      // record writes fail with `invalid input value for enum`.
      await this.fieldMetadataService.updateOneField({
        updateFieldInput: {
          id: existingField.id,
          options: mergedOptions as UpdateFieldInput['options'],
        },
        workspaceId,
      });

      this.logger.log(
        `Synced dashboard.audience options to ${desiredOptions.length} role(s) for workspace ${workspaceId}`,
      );
    }

    return existingField.id;
  }

  private optionsAreEqual(a: AudienceOption[], b: AudienceOption[]): boolean {
    if (a.length !== b.length) {
      return false;
    }

    const serialize = (options: AudienceOption[]): string =>
      JSON.stringify(
        [...options]
          .sort((left, right) => left.value.localeCompare(right.value))
          .map((option) => ({
            value: option.value,
            label: option.label,
            position: option.position,
          })),
      );

    return serialize(a) === serialize(b);
  }

  private async upsertRolePredicate({
    workspaceId,
    roleId,
    objectMetadataId,
    fieldMetadataId,
  }: {
    workspaceId: string;
    roleId: string;
    objectMetadataId: string;
    fieldMetadataId: string;
  }): Promise<void> {
    await this.rowLevelPermissionPredicateService.upsertRowLevelPermissionPredicates(
      {
        workspaceId,
        input: {
          roleId,
          objectMetadataId,
          predicateGroups: [],
          predicates: [
            {
              id: predicateIdForRole(roleId, objectMetadataId),
              fieldMetadataId,
              operand: RowLevelPermissionPredicateOperand.CONTAINS,
              scope: RowLevelPermissionPredicateScope.READ,
              // JSON string of a string[] — matches what the Record-level UI
              // persists for a MULTI_SELECT "contains" rule.
              value: JSON.stringify([encodeRoleToken(roleId)]),
              subFieldName: null,
              workspaceMemberFieldMetadataId: null,
              workspaceMemberSubFieldName: null,
              rowLevelPermissionPredicateGroupId: null,
              positionInRowLevelPermissionPredicateGroup: null,
            },
          ],
        },
      },
    );
  }
}
