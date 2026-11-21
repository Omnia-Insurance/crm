import {
  getObjectPermissionUniversalIdentifier,
  getRowLevelPermissionRuleUniversalIdentifier,
} from 'twenty-shared/application';
import {
  FeatureFlagKey,
  type ObjectRecordsPermissions,
  RowLevelPermissionPredicateOperand,
} from 'twenty-shared/types';
import {
  getFilterOperandsForFilterableFieldType,
  getFilterTypeFromFieldType,
  isDefined,
  mapRLSOperandToRecordFilterOperand,
} from 'twenty-shared/utils';
import { v5 } from 'uuid';

import { OMNIA_ROW_LEVEL_PERMISSION_TRANSLATION_NAMESPACE } from 'src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/constants/omnia-row-level-permission-translation-namespace.constant';
import {
  type ObjectPermissionGrants,
  type RowLevelPermissionRuleGrants,
  type ScopedRowLevelPermissionTranslationPlan,
} from 'src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/types/scoped-row-level-permission-translation-plan.type';
import {
  type LegacyRowLevelPermissionScope,
  type ScopedRowLevelPermissionPredicateGroupRow,
  type ScopedRowLevelPermissionPredicateRow,
  type ScopedRowLevelPermissionTranslationSource,
  type TranslationApplicationRow,
  type TranslationFieldMetadataRow,
  type TranslationFieldPermissionRow,
  type TranslationObjectMetadataRow,
  type TranslationRoleRow,
  type TranslationRowLevelPermissionRuleRow,
} from 'src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/types/scoped-row-level-permission-translation-source.type';
import { convertWorkspaceMemberPredicateToRelationHop } from 'src/database/commands/upgrade-version-command/omnia/translate-scoped-row-level-permissions/utils/convert-workspace-member-predicate-to-relation-hop.util';
import { RECORD_ACCESS_FEATURE_FLAG_KEYS } from 'src/database/commands/upgrade-version-command/omnia/verify-permissions/constants/record-access-feature-flag-keys.constant';
import { buildRowLevelPermissionRules } from 'src/engine/metadata-modules/row-level-permission-predicate/utils/build-row-level-permission-rules.util';
import { type RoleRecordsPermissions } from 'src/engine/permissions/types/role-records-permissions.type';

type RowLevelPermissionPair = {
  roleId: string;
  objectMetadataId: string;
  predicates: ScopedRowLevelPermissionPredicateRow[];
  predicateGroups: ScopedRowLevelPermissionPredicateGroupRow[];
};

type PlanningContext = {
  workspaceId: string;
  roleById: Map<string, TranslationRoleRow>;
  objectMetadataById: Map<string, TranslationObjectMetadataRow>;
  fieldMetadataById: Map<string, TranslationFieldMetadataRow>;
  fieldMetadatasByObjectMetadataId: Map<string, TranslationFieldMetadataRow[]>;
  applicationById: Map<string, TranslationApplicationRow>;
  predicateGroupById: Map<string, ScopedRowLevelPermissionPredicateGroupRow>;
  rowLevelPermissionRules: TranslationRowLevelPermissionRuleRow[];
  fieldPermissions: TranslationFieldPermissionRow[];
  workspaceMemberObjectMetadataId: string | undefined;
  workspaceMemberIdFieldMetadataId: string | undefined;
  rolesPermissions: Partial<Record<string, RoleRecordsPermissions>>;
  shouldMergeMixedScopesFailClosed: boolean;
};

type PlannedPredicateFields = {
  fieldMetadataId: string;
  relationFieldMetadataId: string | null;
  workspaceMemberFieldMetadataId: string | null;
  isConvertedToRelationHop: boolean;
};

const SCOPE_ORDER: LegacyRowLevelPermissionScope[] = ['ALL', 'READ', 'WRITE'];

const NO_RULE_GRANTS: RowLevelPermissionRuleGrants = {
  canCreateRecords: false,
  canReadRecords: false,
  canUpdateRecords: false,
  canSoftDeleteRecords: false,
  canDestroyRecords: false,
};

const ROW_LEVEL_PERMISSION_PREDICATE_OPERANDS: string[] = Object.values(
  RowLevelPermissionPredicateOperand,
);

const isRowLevelPermissionPredicateOperand = (
  operand: string,
): operand is RowLevelPermissionPredicateOperand =>
  ROW_LEVEL_PERMISSION_PREDICATE_OPERANDS.includes(operand);

const uniqueValues = <TValue>(values: TValue[]): TValue[] => [
  ...new Set(values),
];

const buildDeterministicId = (name: string): string =>
  v5(name, OMNIA_ROW_LEVEL_PERMISSION_TRANSLATION_NAMESPACE);

const describePair = ({ roleId, objectMetadataId }: RowLevelPermissionPair) =>
  `role ${roleId} on object ${objectMetadataId}`;

// Ids are global primary keys, so they include the workspace; universal identifiers are per workspace
const buildRootPredicateGroupIdentifiers = ({
  workspaceId,
  roleUniversalIdentifier,
  objectMetadataUniversalIdentifier,
}: {
  workspaceId: string;
  roleUniversalIdentifier: string;
  objectMetadataUniversalIdentifier: string;
}): { id: string; universalIdentifier: string } => {
  const universalIdentifier = buildDeterministicId(
    `${roleUniversalIdentifier}:${objectMetadataUniversalIdentifier}:root-predicate-group`,
  );

  return {
    id: buildDeterministicId(`${workspaceId}:${universalIdentifier}:id`),
    universalIdentifier,
  };
};

const findRootPredicateGroupGrants = ({
  predicateGroup,
  hasRootPredicateGroupToInsert,
  ruleGrants,
}: {
  predicateGroup: ScopedRowLevelPermissionPredicateGroupRow;
  hasRootPredicateGroupToInsert: boolean;
  ruleGrants: RowLevelPermissionRuleGrants;
}): RowLevelPermissionRuleGrants | null => {
  if (isDefined(predicateGroup.parentRowLevelPermissionPredicateGroupId)) {
    return null;
  }

  return hasRootPredicateGroupToInsert ? NO_RULE_GRANTS : ruleGrants;
};

const groupRowsByPair = ({
  predicates,
  predicateGroups,
}: Pick<
  ScopedRowLevelPermissionTranslationSource,
  'predicates' | 'predicateGroups'
>): RowLevelPermissionPair[] => {
  const pairByKey = new Map<string, RowLevelPermissionPair>();

  const findOrCreatePair = ({
    roleId,
    objectMetadataId,
  }: {
    roleId: string;
    objectMetadataId: string;
  }): RowLevelPermissionPair => {
    const key = `${roleId}:${objectMetadataId}`;
    const existingPair = pairByKey.get(key);

    if (isDefined(existingPair)) {
      return existingPair;
    }

    const pair: RowLevelPermissionPair = {
      roleId,
      objectMetadataId,
      predicates: [],
      predicateGroups: [],
    };

    pairByKey.set(key, pair);

    return pair;
  };

  for (const predicate of predicates) {
    findOrCreatePair(predicate).predicates.push(predicate);
  }

  for (const predicateGroup of predicateGroups) {
    if (!predicateGroup.isDeleted) {
      findOrCreatePair(predicateGroup).predicateGroups.push(predicateGroup);
    }
  }

  return [...pairByKey.values()].sort(
    (pairA, pairB) =>
      pairA.roleId.localeCompare(pairB.roleId) ||
      pairA.objectMetadataId.localeCompare(pairB.objectMetadataId),
  );
};

const groupByObjectMetadataId = (
  fieldMetadatas: TranslationFieldMetadataRow[],
): Map<string, TranslationFieldMetadataRow[]> => {
  const fieldMetadatasByObjectMetadataId = new Map<
    string,
    TranslationFieldMetadataRow[]
  >();

  for (const fieldMetadata of fieldMetadatas) {
    fieldMetadatasByObjectMetadataId.set(fieldMetadata.objectMetadataId, [
      ...(fieldMetadatasByObjectMetadataId.get(
        fieldMetadata.objectMetadataId,
      ) ?? []),
      fieldMetadata,
    ]);
  }

  return fieldMetadatasByObjectMetadataId;
};

const isOutsidePair = ({
  row,
  pair,
}: {
  row: { roleId: string; objectMetadataId: string };
  pair: RowLevelPermissionPair;
}) =>
  row.roleId !== pair.roleId || row.objectMetadataId !== pair.objectMetadataId;

// The upstream builder walks parent links across roles and skips deleted groups, so each of these
// would make a group its own rule (matching every record) or attach it to another role's rule
const findPairIntegrityIssues = ({
  pair,
  context,
}: {
  pair: RowLevelPermissionPair;
  context: PlanningContext;
}): string[] => {
  const issues: string[] = [];
  const pairDescription = describePair(pair);

  for (const predicate of pair.predicates) {
    if (!isDefined(predicate.rowLevelPermissionPredicateGroupId)) {
      continue;
    }

    const predicateGroup = context.predicateGroupById.get(
      predicate.rowLevelPermissionPredicateGroupId,
    );

    if (!isDefined(predicateGroup)) {
      issues.push(
        `Predicate ${predicate.id} of ${pairDescription} references missing group ${predicate.rowLevelPermissionPredicateGroupId}`,
      );
    } else if (predicateGroup.isDeleted) {
      issues.push(
        `Predicate ${predicate.id} of ${pairDescription} is in deleted group ${predicateGroup.id}`,
      );
    } else if (isOutsidePair({ row: predicateGroup, pair })) {
      issues.push(
        `Predicate ${predicate.id} of ${pairDescription} is in group ${predicateGroup.id} of role ${predicateGroup.roleId} on object ${predicateGroup.objectMetadataId}`,
      );
    }
  }

  for (const predicateGroup of pair.predicateGroups) {
    if (!isDefined(predicateGroup.parentRowLevelPermissionPredicateGroupId)) {
      continue;
    }

    const parentPredicateGroup = context.predicateGroupById.get(
      predicateGroup.parentRowLevelPermissionPredicateGroupId,
    );

    if (!isDefined(parentPredicateGroup)) {
      issues.push(
        `Group ${predicateGroup.id} of ${pairDescription} references missing parent group ${predicateGroup.parentRowLevelPermissionPredicateGroupId}`,
      );
    } else if (parentPredicateGroup.isDeleted) {
      issues.push(
        `Group ${predicateGroup.id} of ${pairDescription} has deleted parent group ${parentPredicateGroup.id}`,
      );
    } else if (isOutsidePair({ row: parentPredicateGroup, pair })) {
      issues.push(
        `Group ${predicateGroup.id} of ${pairDescription} has parent group ${parentPredicateGroup.id} of role ${parentPredicateGroup.roleId} on object ${parentPredicateGroup.objectMetadataId}`,
      );
    }
  }

  const pairPredicateGroupIds = new Set(
    pair.predicateGroups.map(({ id }) => id),
  );

  for (const predicateGroup of pair.predicateGroups) {
    const visitedPredicateGroupIds = new Set<string>();
    let currentPredicateGroup:
      | ScopedRowLevelPermissionPredicateGroupRow
      | undefined = predicateGroup;

    while (
      isDefined(currentPredicateGroup) &&
      pairPredicateGroupIds.has(currentPredicateGroup.id)
    ) {
      if (visitedPredicateGroupIds.has(currentPredicateGroup.id)) {
        issues.push(
          `Group ${predicateGroup.id} of ${pairDescription} is in a parent cycle`,
        );
        break;
      }

      visitedPredicateGroupIds.add(currentPredicateGroup.id);
      currentPredicateGroup = isDefined(
        currentPredicateGroup.parentRowLevelPermissionPredicateGroupId,
      )
        ? context.predicateGroupById.get(
            currentPredicateGroup.parentRowLevelPermissionPredicateGroupId,
          )
        : undefined;
    }
  }

  for (const fieldPermission of context.fieldPermissions) {
    if (
      pairPredicateGroupIds.has(
        fieldPermission.rowLevelPermissionPredicateGroupId,
      ) &&
      isOutsidePair({ row: fieldPermission, pair })
    ) {
      issues.push(
        `Field permission ${fieldPermission.id} of role ${fieldPermission.roleId} on object ${fieldPermission.objectMetadataId} is scoped to group ${fieldPermission.rowLevelPermissionPredicateGroupId} of ${pairDescription}`,
      );
    }
  }

  return issues;
};

// The engine throws on an operand its field type does not allow, so every query of the role would fail
const findPredicateFieldIssue = ({
  predicate,
  plannedPredicateFields,
  pair,
  context,
}: {
  predicate: ScopedRowLevelPermissionPredicateRow;
  plannedPredicateFields: PlannedPredicateFields;
  pair: RowLevelPermissionPair;
  context: PlanningContext;
}): string | undefined => {
  const fieldMetadata = context.fieldMetadataById.get(
    plannedPredicateFields.fieldMetadataId,
  );

  if (!isDefined(fieldMetadata)) {
    return `field ${plannedPredicateFields.fieldMetadataId} is missing`;
  }

  if (isDefined(plannedPredicateFields.relationFieldMetadataId)) {
    const relationFieldMetadata = context.fieldMetadataById.get(
      plannedPredicateFields.relationFieldMetadataId,
    );

    if (
      !isDefined(relationFieldMetadata) ||
      relationFieldMetadata.objectMetadataId !== pair.objectMetadataId ||
      relationFieldMetadata.relationTargetObjectMetadataId !==
        fieldMetadata.objectMetadataId
    ) {
      return `relation field ${plannedPredicateFields.relationFieldMetadataId} does not lead from the restricted object to the object of field ${fieldMetadata.id}`;
    }
  } else if (fieldMetadata.objectMetadataId !== pair.objectMetadataId) {
    return `field ${fieldMetadata.id} does not belong to the restricted object`;
  }

  if (!isRowLevelPermissionPredicateOperand(predicate.operand)) {
    return `operand ${predicate.operand} is unknown`;
  }

  const allowedOperands = getFilterOperandsForFilterableFieldType({
    filterType: getFilterTypeFromFieldType(fieldMetadata.type),
    subFieldName: plannedPredicateFields.isConvertedToRelationHop
      ? null
      : predicate.subFieldName,
  });

  if (
    !allowedOperands.includes(
      mapRLSOperandToRecordFilterOperand(predicate.operand),
    )
  ) {
    return `operand ${predicate.operand} is not allowed on field ${fieldMetadata.id} of type ${fieldMetadata.type}`;
  }

  return undefined;
};

// Grants come from the pre-rule cache, as in upstream's backfill; create always follows update (contract C1)
const computeTranslatedGrants = ({
  preRuleGrants,
  isWriteOnly,
}: {
  preRuleGrants: ObjectRecordsPermissions | undefined;
  isWriteOnly: boolean;
}): {
  ruleGrants: RowLevelPermissionRuleGrants;
  objectPermissionGrants: ObjectPermissionGrants;
} => {
  const canRead = preRuleGrants?.canReadAllRecords ?? false;
  const canUpdate = preRuleGrants?.canUpdateAllRecords ?? false;

  return {
    ruleGrants: {
      canCreateRecords: canUpdate,
      canReadRecords: isWriteOnly ? false : canRead,
      canUpdateRecords: canUpdate,
      canSoftDeleteRecords: preRuleGrants?.canSoftDeleteAllRecords ?? false,
      canDestroyRecords: preRuleGrants?.canDestroyAllRecords ?? false,
    },
    objectPermissionGrants: {
      canCreateObjectRecords: false,
      canReadObjectRecords: isWriteOnly ? canRead : false,
      canUpdateObjectRecords: false,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
    },
  };
};

// Upstream's backfill only reuses a rule whose identifier it derives itself; any other shape makes it
// insert a second rule and zero the object grants the translation kept
const isRecognizedByUpstreamBackfill = ({
  predicates,
  predicateGroups,
  applicationUniversalIdentifierById,
  roleUniversalIdentifier,
  objectMetadataUniversalIdentifier,
  ruleUniversalIdentifier,
}: {
  predicates: {
    universalIdentifier: string;
    applicationId: string;
    rowLevelPermissionPredicateGroupId: string | null;
  }[];
  predicateGroups: {
    id: string;
    universalIdentifier: string;
    applicationId: string;
    parentRowLevelPermissionPredicateGroupId: string | null;
  }[];
  applicationUniversalIdentifierById: Map<string, string>;
  roleUniversalIdentifier: string;
  objectMetadataUniversalIdentifier: string;
  ruleUniversalIdentifier: string;
}): boolean => {
  const predicateGroupUniversalIdentifierById = new Map(
    predicateGroups.map(({ id, universalIdentifier }) => [
      id,
      universalIdentifier,
    ]),
  );
  const toOwner = (applicationId: string) => ({
    applicationUniversalIdentifier:
      applicationUniversalIdentifierById.get(applicationId) ?? applicationId,
    roleUniversalIdentifier,
    objectMetadataUniversalIdentifier,
  });

  const {
    rules,
    ruleUniversalIdentifierByPredicateGroupUniversalIdentifier,
    ruleUniversalIdentifierByPredicateUniversalIdentifier,
  } = buildRowLevelPermissionRules({
    predicateGroups: predicateGroups.map((predicateGroup) => ({
      ...toOwner(predicateGroup.applicationId),
      universalIdentifier: predicateGroup.universalIdentifier,
      parentRowLevelPermissionPredicateGroupUniversalIdentifier: isDefined(
        predicateGroup.parentRowLevelPermissionPredicateGroupId,
      )
        ? (predicateGroupUniversalIdentifierById.get(
            predicateGroup.parentRowLevelPermissionPredicateGroupId,
          ) ?? null)
        : null,
    })),
    predicates: predicates.map((predicate) => ({
      ...toOwner(predicate.applicationId),
      universalIdentifier: predicate.universalIdentifier,
      rowLevelPermissionPredicateGroupUniversalIdentifier: isDefined(
        predicate.rowLevelPermissionPredicateGroupId,
      )
        ? (predicateGroupUniversalIdentifierById.get(
            predicate.rowLevelPermissionPredicateGroupId,
          ) ?? null)
        : null,
    })),
    now: new Date(0).toISOString(),
  });

  return (
    rules.length === 1 &&
    rules[0].universalIdentifier === ruleUniversalIdentifier &&
    predicateGroups.every(
      ({ universalIdentifier }) =>
        ruleUniversalIdentifierByPredicateGroupUniversalIdentifier.get(
          universalIdentifier,
        ) === ruleUniversalIdentifier,
    ) &&
    predicates.every(
      ({ universalIdentifier }) =>
        ruleUniversalIdentifierByPredicateUniversalIdentifier.get(
          universalIdentifier,
        ) === ruleUniversalIdentifier,
    )
  );
};

const planPairTranslation = ({
  pair,
  context,
  plan,
}: {
  pair: RowLevelPermissionPair;
  context: PlanningContext;
  plan: ScopedRowLevelPermissionTranslationPlan;
}): void => {
  const pairDescription = describePair(pair);
  const role = context.roleById.get(pair.roleId);
  const objectMetadata = context.objectMetadataById.get(pair.objectMetadataId);
  const rows = [...pair.predicates, ...pair.predicateGroups];
  const scopes = SCOPE_ORDER.filter((scope) =>
    rows.some((row) => row.scope === scope),
  );
  const linkedRuleIds = uniqueValues(
    rows
      .map(({ rowLevelPermissionRuleId }) => rowLevelPermissionRuleId)
      .filter(isDefined),
  );

  if (linkedRuleIds.length > 0) {
    const unlinkedRowIds = rows
      .filter(
        ({ rowLevelPermissionRuleId }) => !isDefined(rowLevelPermissionRuleId),
      )
      .map(({ id }) => id);

    if (unlinkedRowIds.length > 0) {
      plan.aborts.push(
        `${pairDescription} has rows linked to rule(s) ${linkedRuleIds.join(', ')} and rows without a rule (${unlinkedRowIds.join(', ')}); link or delete them by hand`,
      );

      return;
    }

    plan.pairReports.push({
      roleId: pair.roleId,
      roleLabel: role?.label ?? null,
      objectMetadataId: pair.objectMetadataId,
      objectNameSingular: objectMetadata?.nameSingular ?? null,
      outcome: 'skipped',
      scopes,
      rowLevelPermissionRuleIds: linkedRuleIds,
      ruleGrants: null,
      objectPermissionGrants: null,
      predicateCount: pair.predicates.length,
      predicateGroupCount: pair.predicateGroups.length,
      relationHopConversionCount: 0,
      hasRootPredicateGroupToInsert: false,
      warnings: [],
    });

    return;
  }

  const unlinkedRuleIds = context.rowLevelPermissionRules
    .filter((rule) => !isOutsidePair({ row: rule, pair }))
    .map(({ id }) => id);

  if (unlinkedRuleIds.length > 0) {
    plan.aborts.push(
      `${pairDescription} already has rule(s) ${unlinkedRuleIds.join(', ')} while none of its predicates or groups is linked; resolve it by hand`,
    );

    return;
  }

  if (!isDefined(role) || !isDefined(objectMetadata)) {
    plan.aborts.push(`${pairDescription} references a missing role or object`);

    return;
  }

  const integrityIssues = findPairIntegrityIssues({ pair, context });
  const issues = [...integrityIssues];
  const isMixedScope = scopes.length > 1;

  if (isMixedScope && !context.shouldMergeMixedScopesFailClosed) {
    const rowIdsByScope = scopes.map(
      (scope) =>
        `${scope}: predicates [${pair.predicates
          .filter((predicate) => predicate.scope === scope)
          .map(({ id }) => id)
          .join(', ')}], groups [${pair.predicateGroups
          .filter((predicateGroup) => predicateGroup.scope === scope)
          .map(({ id }) => id)
          .join(', ')}]`,
    );

    issues.push(
      `${pairDescription} mixes scopes (${rowIdsByScope.join('; ')}); flatten it by hand, or with sign-off rerun upgrade:2-58:omnia-translate-scoped-row-level-permissions --merge-mixed-scopes-fail-closed`,
    );
  }

  const plannedPredicateFieldsById = new Map<string, PlannedPredicateFields>();

  for (const predicate of pair.predicates) {
    const relationHopConversion = convertWorkspaceMemberPredicateToRelationHop({
      predicate,
      fieldMetadataById: context.fieldMetadataById,
      fieldMetadatasByObjectMetadataId:
        context.fieldMetadatasByObjectMetadataId,
      workspaceMemberObjectMetadataId: context.workspaceMemberObjectMetadataId,
      workspaceMemberIdFieldMetadataId:
        context.workspaceMemberIdFieldMetadataId,
    });

    if (relationHopConversion.status === 'invalid') {
      issues.push(
        `Predicate ${predicate.id} of ${pairDescription} cannot become a relation hop: ${relationHopConversion.reason}`,
      );
      continue;
    }

    const plannedPredicateFields: PlannedPredicateFields =
      relationHopConversion.status === 'converted'
        ? {
            fieldMetadataId: relationHopConversion.fieldMetadataId,
            relationFieldMetadataId:
              relationHopConversion.relationFieldMetadataId,
            workspaceMemberFieldMetadataId:
              relationHopConversion.workspaceMemberFieldMetadataId,
            isConvertedToRelationHop: true,
          }
        : {
            fieldMetadataId: predicate.fieldMetadataId,
            relationFieldMetadataId: predicate.relationFieldMetadataId,
            workspaceMemberFieldMetadataId:
              predicate.workspaceMemberFieldMetadataId,
            isConvertedToRelationHop: false,
          };

    const predicateFieldIssue = findPredicateFieldIssue({
      predicate,
      plannedPredicateFields,
      pair,
      context,
    });

    if (isDefined(predicateFieldIssue)) {
      issues.push(
        `Predicate ${predicate.id} of ${pairDescription}: ${predicateFieldIssue}`,
      );
    }

    plannedPredicateFieldsById.set(predicate.id, plannedPredicateFields);
  }

  const rootPredicateGroups = pair.predicateGroups.filter(
    ({ parentRowLevelPermissionPredicateGroupId }) =>
      !isDefined(parentRowLevelPermissionPredicateGroupId),
  );
  const ungroupedPredicates = pair.predicates.filter(
    ({ rowLevelPermissionPredicateGroupId }) =>
      !isDefined(rowLevelPermissionPredicateGroupId),
  );
  const ungroupedPredicateApplicationIds = uniqueValues(
    ungroupedPredicates.map(({ applicationId }) => applicationId),
  );
  // Upstream makes one rule per root tree and ORs them; v2.19 ANDed them, so several trees get one AND root
  const rootTreeCount =
    rootPredicateGroups.length + ungroupedPredicateApplicationIds.length;
  const shouldInsertRootPredicateGroup = rootTreeCount > 1;
  const rootTreeApplicationIds = uniqueValues([
    ...rootPredicateGroups.map(({ applicationId }) => applicationId),
    ...ungroupedPredicateApplicationIds,
  ]);

  // Root trees only mean something once every group link stays inside the pair
  if (integrityIssues.length === 0 && rootTreeCount === 0) {
    issues.push(`${pairDescription} has no root group`);
  }

  if (
    integrityIssues.length === 0 &&
    shouldInsertRootPredicateGroup &&
    rootTreeApplicationIds.length > 1
  ) {
    issues.push(
      `${pairDescription} has ${rootTreeCount} root trees owned by applications ${rootTreeApplicationIds.join(', ')}; one root group cannot own them all, merge them by hand`,
    );
  }

  const [ruleApplicationId] = rootTreeApplicationIds;
  const ruleApplicationUniversalIdentifier = isDefined(ruleApplicationId)
    ? context.applicationById.get(ruleApplicationId)?.universalIdentifier
    : undefined;
  const roleApplicationUniversalIdentifier = context.applicationById.get(
    role.applicationId,
  )?.universalIdentifier;

  if (
    isDefined(ruleApplicationId) &&
    !isDefined(ruleApplicationUniversalIdentifier)
  ) {
    issues.push(
      `${pairDescription}: application ${ruleApplicationId} owning its root tree is missing`,
    );
  }

  if (!isDefined(roleApplicationUniversalIdentifier)) {
    issues.push(
      `${pairDescription}: application ${role.applicationId} of the role is missing`,
    );
  }

  if (
    issues.length > 0 ||
    !isDefined(ruleApplicationId) ||
    !isDefined(ruleApplicationUniversalIdentifier) ||
    !isDefined(roleApplicationUniversalIdentifier)
  ) {
    plan.aborts.push(...uniqueValues(issues));

    return;
  }

  const isWriteOnly = scopes.length === 1 && scopes[0] === 'WRITE';
  const { ruleGrants, objectPermissionGrants } = computeTranslatedGrants({
    preRuleGrants:
      context.rolesPermissions[pair.roleId]?.objects[pair.objectMetadataId],
    isWriteOnly,
  });
  const objectPermissionGrantsUpsert = {
    universalIdentifier: getObjectPermissionUniversalIdentifier({
      applicationUniversalIdentifier: roleApplicationUniversalIdentifier,
      roleUniversalIdentifier: role.universalIdentifier,
      objectUniversalIdentifier: objectMetadata.universalIdentifier,
    }),
    applicationId: role.applicationId,
    roleId: pair.roleId,
    objectMetadataId: pair.objectMetadataId,
    grants: objectPermissionGrants,
  };
  const pairPredicateGroupIds = new Set(
    pair.predicateGroups.map(({ id }) => id),
  );
  const pairFieldPermissions = context.fieldPermissions.filter(
    ({ rowLevelPermissionPredicateGroupId }) =>
      pairPredicateGroupIds.has(rowLevelPermissionPredicateGroupId),
  );

  // The role reaches no record the predicates restricted, so they go instead of becoming a rule that grants nothing;
  // the object grants are still pinned, so a later role-wide grant does not open the object
  if (Object.values(ruleGrants).every((isGranted) => !isGranted)) {
    if (pairFieldPermissions.length > 0) {
      plan.aborts.push(
        `${pairDescription} grants no operation, so its predicates and groups would be removed, but field permission(s) ${pairFieldPermissions.map(({ id }) => id).join(', ')} are scoped to its groups; remove them by hand`,
      );

      return;
    }

    plan.predicateIdsToSoftDelete.push(...pair.predicates.map(({ id }) => id));
    plan.predicateGroupIdsToSoftDelete.push(...pairPredicateGroupIds);
    plan.objectPermissionGrantsUpserts.push(objectPermissionGrantsUpsert);
    plan.pairReports.push({
      roleId: pair.roleId,
      roleLabel: role.label,
      objectMetadataId: pair.objectMetadataId,
      objectNameSingular: objectMetadata.nameSingular,
      outcome: 'removed',
      scopes,
      rowLevelPermissionRuleIds: [],
      ruleGrants: null,
      objectPermissionGrants,
      predicateCount: pair.predicates.length,
      predicateGroupCount: pair.predicateGroups.length,
      relationHopConversionCount: 0,
      hasRootPredicateGroupToInsert: false,
      warnings: [
        'the role had no access its predicates restricted, so they are removed and no rule is created',
      ],
    });

    return;
  }

  const rootPredicateGroupToInsert = shouldInsertRootPredicateGroup
    ? buildRootPredicateGroupIdentifiers({
        workspaceId: context.workspaceId,
        roleUniversalIdentifier: role.universalIdentifier,
        objectMetadataUniversalIdentifier: objectMetadata.universalIdentifier,
      })
    : undefined;

  const rootRowLevelPermissionPredicateGroupUniversalIdentifier =
    rootPredicateGroupToInsert?.universalIdentifier ??
    (rootPredicateGroups.length === 1
      ? rootPredicateGroups[0].universalIdentifier
      : null);

  const ruleUniversalIdentifier = getRowLevelPermissionRuleUniversalIdentifier({
    applicationUniversalIdentifier: ruleApplicationUniversalIdentifier,
    roleUniversalIdentifier: role.universalIdentifier,
    objectMetadataUniversalIdentifier: objectMetadata.universalIdentifier,
    rootRowLevelPermissionPredicateGroupUniversalIdentifier,
  });
  const ruleId = buildDeterministicId(
    `${context.workspaceId}:${ruleUniversalIdentifier}:id`,
  );

  const toPlannedParentPredicateGroupId = (
    parentPredicateGroupId: string | null,
  ): string | null =>
    parentPredicateGroupId ?? rootPredicateGroupToInsert?.id ?? null;

  const plannedPredicateGroups = [
    ...(isDefined(rootPredicateGroupToInsert)
      ? [
          {
            ...rootPredicateGroupToInsert,
            applicationId: ruleApplicationId,
            parentRowLevelPermissionPredicateGroupId: null,
          },
        ]
      : []),
    ...pair.predicateGroups.map((predicateGroup) => ({
      id: predicateGroup.id,
      universalIdentifier: predicateGroup.universalIdentifier,
      applicationId: predicateGroup.applicationId,
      parentRowLevelPermissionPredicateGroupId: toPlannedParentPredicateGroupId(
        predicateGroup.parentRowLevelPermissionPredicateGroupId,
      ),
    })),
  ];
  const plannedPredicates = pair.predicates.map((predicate) => ({
    id: predicate.id,
    universalIdentifier: predicate.universalIdentifier,
    applicationId: predicate.applicationId,
    rowLevelPermissionPredicateGroupId: toPlannedParentPredicateGroupId(
      predicate.rowLevelPermissionPredicateGroupId,
    ),
  }));

  if (
    !isRecognizedByUpstreamBackfill({
      predicates: plannedPredicates,
      predicateGroups: plannedPredicateGroups,
      applicationUniversalIdentifierById: new Map(
        [...context.applicationById.values()].map(
          ({ id, universalIdentifier }) => [id, universalIdentifier],
        ),
      ),
      roleUniversalIdentifier: role.universalIdentifier,
      objectMetadataUniversalIdentifier: objectMetadata.universalIdentifier,
      ruleUniversalIdentifier,
    })
  ) {
    plan.aborts.push(
      `${pairDescription}: the planned rule ${ruleUniversalIdentifier} is not the single rule upstream's backfill derives from the translated tree`,
    );

    return;
  }

  plan.rowLevelPermissionRulesToInsert.push({
    id: ruleId,
    universalIdentifier: ruleUniversalIdentifier,
    applicationId: ruleApplicationId,
    roleId: pair.roleId,
    objectMetadataId: pair.objectMetadataId,
    grants: ruleGrants,
  });

  if (isDefined(rootPredicateGroupToInsert)) {
    plan.rootPredicateGroupsToInsert.push({
      ...rootPredicateGroupToInsert,
      applicationId: ruleApplicationId,
      roleId: pair.roleId,
      objectMetadataId: pair.objectMetadataId,
      rowLevelPermissionRuleId: ruleId,
      // Rollback to v2.6 only reads a group chain whose scopes all match
      scope: isMixedScope ? 'ALL' : scopes[0],
      grants: ruleGrants,
    });
  }

  for (const predicate of pair.predicates) {
    const plannedPredicateFields = plannedPredicateFieldsById.get(predicate.id);

    if (!isDefined(plannedPredicateFields)) {
      continue;
    }

    plan.predicateUpdates.push({
      id: predicate.id,
      ...plannedPredicateFields,
      rowLevelPermissionPredicateGroupId: toPlannedParentPredicateGroupId(
        predicate.rowLevelPermissionPredicateGroupId,
      ),
      rowLevelPermissionRuleId: ruleId,
    });
  }

  // The engine ignores group grant columns but the settings draft reads them from the rule root
  for (const predicateGroup of pair.predicateGroups) {
    plan.predicateGroupUpdates.push({
      id: predicateGroup.id,
      parentRowLevelPermissionPredicateGroupId: toPlannedParentPredicateGroupId(
        predicateGroup.parentRowLevelPermissionPredicateGroupId,
      ),
      rowLevelPermissionRuleId: ruleId,
      grants: findRootPredicateGroupGrants({
        predicateGroup,
        hasRootPredicateGroupToInsert: isDefined(rootPredicateGroupToInsert),
        ruleGrants,
      }),
    });
  }

  for (const fieldPermission of pairFieldPermissions) {
    if (fieldPermission.rowLevelPermissionRuleId !== ruleId) {
      plan.fieldPermissionRuleLinks.push({
        id: fieldPermission.id,
        rowLevelPermissionRuleId: ruleId,
      });
    }
  }

  plan.objectPermissionGrantsUpserts.push(objectPermissionGrantsUpsert);

  const warnings = [
    ...(isMixedScope
      ? [
          `mixed scopes ${scopes.join(', ')} merged fail-closed into one AND rule: every tree now restricts every operation`,
        ]
      : []),
    ...(pair.predicates.length === 0
      ? [
          'no live predicate: the rule matches no record, so the role reaches no record for the restricted operations',
        ]
      : []),
  ];

  plan.pairReports.push({
    roleId: pair.roleId,
    roleLabel: role.label,
    objectMetadataId: pair.objectMetadataId,
    objectNameSingular: objectMetadata.nameSingular,
    outcome: 'translated',
    scopes,
    rowLevelPermissionRuleIds: [ruleId],
    ruleGrants,
    objectPermissionGrants,
    predicateCount: pair.predicates.length,
    predicateGroupCount: pair.predicateGroups.length,
    relationHopConversionCount: [...plannedPredicateFieldsById.values()].filter(
      ({ isConvertedToRelationHop }) => isConvertedToRelationHop,
    ).length,
    hasRootPredicateGroupToInsert: isDefined(rootPredicateGroupToInsert),
    warnings,
  });
};

export const planScopedRowLevelPermissionTranslation = ({
  workspaceId,
  source,
  rolesPermissions,
  shouldMergeMixedScopesFailClosed,
}: {
  workspaceId: string;
  source: ScopedRowLevelPermissionTranslationSource;
  rolesPermissions: Partial<Record<string, RoleRecordsPermissions>>;
  shouldMergeMixedScopesFailClosed: boolean;
}): ScopedRowLevelPermissionTranslationPlan => {
  const plan: ScopedRowLevelPermissionTranslationPlan = {
    aborts: [],
    rowLevelPermissionRulesToInsert: [],
    rootPredicateGroupsToInsert: [],
    predicateUpdates: [],
    predicateGroupUpdates: [],
    fieldPermissionRuleLinks: [],
    objectPermissionGrantsUpserts: [],
    predicateIdsToSoftDelete: [],
    predicateGroupIdsToSoftDelete: [],
    shouldEnableRelationHop: false,
    pairReports: [],
  };

  const workspaceMemberObjectMetadataId = source.objectMetadatas.find(
    ({ nameSingular }) => nameSingular === 'workspaceMember',
  )?.id;

  const context: PlanningContext = {
    workspaceId,
    roleById: new Map(source.roles.map((role) => [role.id, role])),
    objectMetadataById: new Map(
      source.objectMetadatas.map((objectMetadata) => [
        objectMetadata.id,
        objectMetadata,
      ]),
    ),
    fieldMetadataById: new Map(
      source.fieldMetadatas.map((fieldMetadata) => [
        fieldMetadata.id,
        fieldMetadata,
      ]),
    ),
    fieldMetadatasByObjectMetadataId: groupByObjectMetadataId(
      source.fieldMetadatas,
    ),
    applicationById: new Map(
      source.applications.map((application) => [application.id, application]),
    ),
    predicateGroupById: new Map(
      source.predicateGroups.map((predicateGroup) => [
        predicateGroup.id,
        predicateGroup,
      ]),
    ),
    rowLevelPermissionRules: source.rowLevelPermissionRules,
    fieldPermissions: source.fieldPermissions,
    workspaceMemberObjectMetadataId,
    workspaceMemberIdFieldMetadataId: source.fieldMetadatas.find(
      ({ objectMetadataId, name }) =>
        objectMetadataId === workspaceMemberObjectMetadataId && name === 'id',
    )?.id,
    rolesPermissions,
    shouldMergeMixedScopesFailClosed,
  };

  for (const pair of groupRowsByPair(source)) {
    planPairTranslation({ pair, context, plan });
  }

  const plannedRelationFieldMetadataIdByPredicateId = new Map(
    plan.predicateUpdates.map(({ id, relationFieldMetadataId }) => [
      id,
      relationFieldMetadataId,
    ]),
  );
  const softDeletedPredicateIds = new Set(plan.predicateIdsToSoftDelete);
  const hasRelationHop = source.predicates.some(
    (predicate) =>
      !softDeletedPredicateIds.has(predicate.id) &&
      isDefined(
        plannedRelationFieldMetadataIdByPredicateId.get(predicate.id) ??
          predicate.relationFieldMetadataId,
      ),
  );

  plan.shouldEnableRelationHop =
    hasRelationHop &&
    source.featureFlags[
      FeatureFlagKey.IS_ROW_LEVEL_PERMISSION_RELATION_HOP_ENABLED
    ] !== true;

  const hasTranslationWork =
    plan.pairReports.some(({ outcome }) => outcome !== 'skipped') ||
    plan.aborts.length > 0 ||
    plan.shouldEnableRelationHop;
  const enabledRiskyFeatureFlagKeys = RECORD_ACCESS_FEATURE_FLAG_KEYS.filter(
    (featureFlagKey) => source.featureFlags[featureFlagKey] === true,
  );

  if (hasTranslationWork && enabledRiskyFeatureFlagKeys.length > 0) {
    plan.aborts.push(
      `Feature flag(s) ${enabledRiskyFeatureFlagKeys.join(', ')} are on; they widen or replace rule checks, turn them off before translating`,
    );
  }

  return plan;
};
