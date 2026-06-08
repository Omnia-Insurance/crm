import { definePostInstallLogicFunction } from 'twenty-sdk/define';
import { type InstallPayload } from 'twenty-sdk/logic-function';

import { BROKERAGE_AGENT_ROLE_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

type GraphqlError = {
  message: string;
};

type RequiredCondition =
  | {
      type: 'always';
    }
  | {
      type: 'fieldEmpty' | 'fieldNotEmpty';
      fieldId: string;
    };

type ObjectFieldRecord = {
  id: string;
  name: string;
  defaultValue?: unknown;
  requiredCondition?: RequiredCondition | null;
};

type ObjectMetadataRecord = {
  id: string;
  nameSingular: string;
  fieldsList: ObjectFieldRecord[];
};

type ObjectMetadataEdge = {
  node: ObjectMetadataRecord;
};

type ViewSortDirection = 'ASC' | 'DESC';

type ViewSortRecord = {
  id: string;
  fieldMetadataId: string;
  direction: ViewSortDirection;
  deletedAt?: string | null;
};

type ViewRecord = {
  id: string;
  name: string;
  objectMetadataId: string;
  visibility: 'WORKSPACE' | 'UNLISTED';
  viewSorts: ViewSortRecord[];
};

type FindViewSortSetupData = {
  objects: {
    edges: ObjectMetadataEdge[];
  };
  getViews: ViewRecord[];
  getRoles: RoleRecord[];
};

type ViewSortTarget = {
  objectNameSingular: string;
  fieldName: string;
  viewNames: string[];
};

type ViewSortSetupResult = {
  created: number;
  updated: number;
  unchanged: number;
  skipped: string[];
};

type SetupResult = {
  updated: number;
  unchanged: number;
  skipped: string[];
};

type RowLevelPermissionPredicateOperand =
  | 'IS'
  | 'IS_NOT_NULL'
  | 'IS_NOT'
  | 'LESS_THAN_OR_EQUAL'
  | 'GREATER_THAN_OR_EQUAL'
  | 'IS_BEFORE'
  | 'IS_AFTER'
  | 'CONTAINS'
  | 'DOES_NOT_CONTAIN'
  | 'IS_EMPTY'
  | 'IS_NOT_EMPTY'
  | 'IS_RELATIVE'
  | 'IS_IN_PAST'
  | 'IS_IN_FUTURE'
  | 'IS_TODAY'
  | 'VECTOR_SEARCH';

type RowLevelPermissionPredicateScope = 'ALL' | 'READ' | 'WRITE';

type RowLevelPermissionPredicateGroupLogicalOperator = 'AND' | 'OR';

type ObjectPermissionRecord = {
  objectMetadataId: string;
  canReadObjectRecords?: boolean | null;
  canUpdateObjectRecords?: boolean | null;
  canSoftDeleteObjectRecords?: boolean | null;
  canDestroyObjectRecords?: boolean | null;
};

type RowLevelPermissionPredicateRecord = {
  id?: string;
  fieldMetadataId: string;
  objectMetadataId: string;
  operand: RowLevelPermissionPredicateOperand;
  scope: RowLevelPermissionPredicateScope;
  value?: unknown;
  subFieldName?: string | null;
  workspaceMemberFieldMetadataId?: string | null;
  workspaceMemberSubFieldName?: string | null;
  rowLevelPermissionPredicateGroupId?: string | null;
  positionInRowLevelPermissionPredicateGroup?: number | null;
};

type RowLevelPermissionPredicateInput = Omit<
  RowLevelPermissionPredicateRecord,
  'objectMetadataId'
>;

type RowLevelPermissionPredicateGroupRecord = {
  id: string;
  objectMetadataId: string;
  parentRowLevelPermissionPredicateGroupId?: string | null;
  logicalOperator: RowLevelPermissionPredicateGroupLogicalOperator;
  scope: RowLevelPermissionPredicateScope;
  positionInRowLevelPermissionPredicateGroup?: number | null;
};

type RoleRecord = {
  id: string;
  universalIdentifier?: string | null;
  label: string;
  objectPermissions?: ObjectPermissionRecord[] | null;
  rowLevelPermissionPredicates?: RowLevelPermissionPredicateRecord[] | null;
  rowLevelPermissionPredicateGroups?:
    | RowLevelPermissionPredicateGroupRecord[]
    | null;
};

type BrokeragePostInstallResult = {
  viewSorts: ViewSortSetupResult;
  requiredFields: SetupResult;
  agentPolicyRls: SetupResult;
};

const VIEW_SORT_TARGETS: ViewSortTarget[] = [
  {
    objectNameSingular: 'person',
    fieldName: 'createdAt',
    viewNames: ['All Leads', 'All People', 'Today', 'MTD'],
  },
  {
    objectNameSingular: 'policy',
    fieldName: 'submittedDate',
    viewNames: ['All Policies', 'Today', 'MTD'],
  },
  {
    objectNameSingular: 'call',
    fieldName: 'callDate',
    viewNames: ['All Calls', 'Today', 'MTD'],
  },
];

const REQUIRED_LEAD_FIELD_NAMES = [
  'name',
  'addressCustom',
  'emails',
  'phones',
  'dateOfBirth',
];

const LEAD_STATUS_FIELD_NAME = 'leadStatus';
const LEAD_STATUS_DEFAULT_VALUE = "'ASSIGNED'";

const REQUIRED_POLICY_FIELD_NAMES = [
  'premium',
  'carrier',
  'lead',
  'effectiveDate',
  'agent',
  'product',
  'applicantCount',
];

const POLICY_APPLICATION_ID_FIELD_NAME = 'applicationId';
const POLICY_APPLICATION_ID_DEPENDENCY_FIELD_NAME = 'policyNumber';
const POLICY_POLICY_NUMBER_FIELD_NAME = 'policyNumber';
const POLICY_POLICY_NUMBER_DEPENDENCY_FIELD_NAME = 'applicationId';
const POLICY_STATUS_FIELD_NAME = 'status';
const POLICY_STATUS_DEFAULT_VALUE = "'SUBMITTED'";
const AGENT_ROLE_LABEL = 'Agent';
const AGENT_RELATION_FIELD_NAME = 'agent';
const WORKSPACE_MEMBER_OBJECT_NAME = 'workspaceMember';
const WORKSPACE_MEMBER_ID_FIELD_NAME = 'id';
const WORKSPACE_MEMBER_DYNAMIC_VALUE = null;

const VIEW_MODIFICATION_PERMISSION_ERROR_MESSAGE =
  'You do not have permission to modify this view';

const ALWAYS_REQUIRED_CONDITION: RequiredCondition = {
  type: 'always',
};

const FIND_VIEW_SORT_SETUP_QUERY = `
  query FindBrokerageViewSortSetup {
    objects(paging: { first: 200 }) {
      edges {
        node {
          id
          nameSingular
          fieldsList {
            id
            name
            defaultValue
            requiredCondition
          }
        }
      }
    }
    getViews(viewTypes: [TABLE]) {
      id
      name
      objectMetadataId
      visibility
      viewSorts {
        id
        fieldMetadataId
        direction
        deletedAt
      }
    }
    getRoles {
      id
      universalIdentifier
      label
      objectPermissions {
        objectMetadataId
        canReadObjectRecords
        canUpdateObjectRecords
        canSoftDeleteObjectRecords
        canDestroyObjectRecords
      }
      rowLevelPermissionPredicates {
        id
        fieldMetadataId
        objectMetadataId
        operand
        scope
        value
        subFieldName
        workspaceMemberFieldMetadataId
        workspaceMemberSubFieldName
        rowLevelPermissionPredicateGroupId
        positionInRowLevelPermissionPredicateGroup
      }
      rowLevelPermissionPredicateGroups {
        id
        objectMetadataId
        parentRowLevelPermissionPredicateGroupId
        logicalOperator
        scope
        positionInRowLevelPermissionPredicateGroup
      }
    }
  }
`;

const UPDATE_FIELD_REQUIRED_CONDITION_MUTATION = `
  mutation UpdateBrokerageRequiredField(
    $input: UpdateOneFieldMetadataInput!
  ) {
    updateOneField(input: $input) {
      id
      defaultValue
      requiredCondition
    }
  }
`;

const CREATE_VIEW_SORT_MUTATION = `
  mutation CreateBrokerageViewSort($input: CreateViewSortInput!) {
    createViewSort(input: $input) {
      id
    }
  }
`;

const UPDATE_VIEW_SORT_MUTATION = `
  mutation UpdateBrokerageViewSort($input: UpdateViewSortInput!) {
    updateViewSort(input: $input) {
      id
    }
  }
`;

const UPSERT_OBJECT_PERMISSIONS_MUTATION = `
  mutation UpsertBrokerageAgentObjectPermissions(
    $upsertObjectPermissionsInput: UpsertObjectPermissionsInput!
  ) {
    upsertObjectPermissions(
      upsertObjectPermissionsInput: $upsertObjectPermissionsInput
    ) {
      objectMetadataId
      canReadObjectRecords
      canUpdateObjectRecords
      canSoftDeleteObjectRecords
      canDestroyObjectRecords
    }
  }
`;

const UPSERT_ROW_LEVEL_PERMISSION_PREDICATES_MUTATION = `
  mutation UpsertBrokerageAgentPolicyRls(
    $input: UpsertRowLevelPermissionPredicatesInput!
  ) {
    upsertRowLevelPermissionPredicates(input: $input) {
      predicates {
        id
      }
      predicateGroups {
        id
      }
    }
  }
`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isGraphqlError = (value: unknown): value is GraphqlError =>
  isRecord(value) && typeof value.message === 'string';

const isRequiredConditionType = (
  value: unknown,
): value is RequiredCondition['type'] =>
  value === 'always' || value === 'fieldEmpty' || value === 'fieldNotEmpty';

const isRequiredCondition = (value: unknown): value is RequiredCondition => {
  if (!isRecord(value) || !isRequiredConditionType(value.type)) {
    return false;
  }

  if (value.type === 'always') {
    return true;
  }

  return typeof value.fieldId === 'string';
};

const isObjectFieldRecord = (value: unknown): value is ObjectFieldRecord =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  (value.requiredCondition === undefined ||
    value.requiredCondition === null ||
    isRequiredCondition(value.requiredCondition));

const isObjectMetadataRecord = (
  value: unknown,
): value is ObjectMetadataRecord =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.nameSingular === 'string' &&
  Array.isArray(value.fieldsList) &&
  value.fieldsList.every(isObjectFieldRecord);

const isObjectMetadataEdge = (value: unknown): value is ObjectMetadataEdge =>
  isRecord(value) && isObjectMetadataRecord(value.node);

const isViewSortDirection = (value: unknown): value is ViewSortDirection =>
  value === 'ASC' || value === 'DESC';

const isViewSortRecord = (value: unknown): value is ViewSortRecord =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.fieldMetadataId === 'string' &&
  isViewSortDirection(value.direction) &&
  (value.deletedAt === undefined ||
    value.deletedAt === null ||
    typeof value.deletedAt === 'string');

const isViewVisibility = (value: unknown): value is ViewRecord['visibility'] =>
  value === 'WORKSPACE' || value === 'UNLISTED';

const isViewRecord = (value: unknown): value is ViewRecord =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  typeof value.objectMetadataId === 'string' &&
  isViewVisibility(value.visibility) &&
  Array.isArray(value.viewSorts) &&
  value.viewSorts.every(isViewSortRecord);

const isNullableBoolean = (value: unknown) =>
  value === undefined || value === null || typeof value === 'boolean';

const isNullableString = (value: unknown) =>
  value === undefined || value === null || typeof value === 'string';

const isNullableNumber = (value: unknown) =>
  value === undefined || value === null || typeof value === 'number';

const isObjectPermissionRecord = (
  value: unknown,
): value is ObjectPermissionRecord =>
  isRecord(value) &&
  typeof value.objectMetadataId === 'string' &&
  isNullableBoolean(value.canReadObjectRecords) &&
  isNullableBoolean(value.canUpdateObjectRecords) &&
  isNullableBoolean(value.canSoftDeleteObjectRecords) &&
  isNullableBoolean(value.canDestroyObjectRecords);

const isRowLevelPermissionPredicateOperand = (
  value: unknown,
): value is RowLevelPermissionPredicateOperand =>
  typeof value === 'string' &&
  [
    'IS',
    'IS_NOT_NULL',
    'IS_NOT',
    'LESS_THAN_OR_EQUAL',
    'GREATER_THAN_OR_EQUAL',
    'IS_BEFORE',
    'IS_AFTER',
    'CONTAINS',
    'DOES_NOT_CONTAIN',
    'IS_EMPTY',
    'IS_NOT_EMPTY',
    'IS_RELATIVE',
    'IS_IN_PAST',
    'IS_IN_FUTURE',
    'IS_TODAY',
    'VECTOR_SEARCH',
  ].includes(value);

const isRowLevelPermissionPredicateScope = (
  value: unknown,
): value is RowLevelPermissionPredicateScope =>
  value === 'ALL' || value === 'READ' || value === 'WRITE';

const isRowLevelPermissionPredicateGroupLogicalOperator = (
  value: unknown,
): value is RowLevelPermissionPredicateGroupLogicalOperator =>
  value === 'AND' || value === 'OR';

const isRowLevelPermissionPredicateRecord = (
  value: unknown,
): value is RowLevelPermissionPredicateRecord =>
  isRecord(value) &&
  isNullableString(value.id) &&
  typeof value.fieldMetadataId === 'string' &&
  typeof value.objectMetadataId === 'string' &&
  isRowLevelPermissionPredicateOperand(value.operand) &&
  isRowLevelPermissionPredicateScope(value.scope) &&
  isNullableString(value.subFieldName) &&
  isNullableString(value.workspaceMemberFieldMetadataId) &&
  isNullableString(value.workspaceMemberSubFieldName) &&
  isNullableString(value.rowLevelPermissionPredicateGroupId) &&
  isNullableNumber(value.positionInRowLevelPermissionPredicateGroup);

const isRowLevelPermissionPredicateGroupRecord = (
  value: unknown,
): value is RowLevelPermissionPredicateGroupRecord =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.objectMetadataId === 'string' &&
  isNullableString(value.parentRowLevelPermissionPredicateGroupId) &&
  isRowLevelPermissionPredicateGroupLogicalOperator(value.logicalOperator) &&
  isRowLevelPermissionPredicateScope(value.scope) &&
  isNullableNumber(value.positionInRowLevelPermissionPredicateGroup);

const isRoleRecord = (value: unknown): value is RoleRecord =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  isNullableString(value.universalIdentifier) &&
  typeof value.label === 'string' &&
  (value.objectPermissions === undefined ||
    value.objectPermissions === null ||
    (Array.isArray(value.objectPermissions) &&
      value.objectPermissions.every(isObjectPermissionRecord))) &&
  (value.rowLevelPermissionPredicates === undefined ||
    value.rowLevelPermissionPredicates === null ||
    (Array.isArray(value.rowLevelPermissionPredicates) &&
      value.rowLevelPermissionPredicates.every(
        isRowLevelPermissionPredicateRecord,
      ))) &&
  (value.rowLevelPermissionPredicateGroups === undefined ||
    value.rowLevelPermissionPredicateGroups === null ||
    (Array.isArray(value.rowLevelPermissionPredicateGroups) &&
      value.rowLevelPermissionPredicateGroups.every(
        isRowLevelPermissionPredicateGroupRecord,
      )));

const isFindViewSortSetupData = (
  value: unknown,
): value is FindViewSortSetupData =>
  isRecord(value) &&
  isRecord(value.objects) &&
  Array.isArray(value.objects.edges) &&
  value.objects.edges.every(isObjectMetadataEdge) &&
  Array.isArray(value.getViews) &&
  value.getViews.every(isViewRecord) &&
  Array.isArray(value.getRoles) &&
  value.getRoles.every(isRoleRecord);

const areRequiredConditionsEqual = ({
  currentCondition,
  targetCondition,
}: {
  currentCondition: RequiredCondition | null | undefined;
  targetCondition: RequiredCondition;
}) => {
  if (currentCondition === null || currentCondition === undefined) {
    return false;
  }

  if (targetCondition.type === 'always') {
    return currentCondition.type === 'always';
  }

  return (
    currentCondition.type === targetCondition.type &&
    currentCondition.fieldId === targetCondition.fieldId
  );
};

const isViewModificationPermissionError = (error: unknown): boolean =>
  error instanceof Error &&
  error.message.includes(VIEW_MODIFICATION_PERMISSION_ERROR_MESSAGE);

const getApiConfig = () => {
  const apiBaseUrl = process.env.TWENTY_API_URL;
  const appToken = process.env.TWENTY_APP_ACCESS_TOKEN;

  if (apiBaseUrl === undefined || apiBaseUrl.length === 0) {
    throw new Error('TWENTY_API_URL is required');
  }

  if (appToken === undefined || appToken.length === 0) {
    throw new Error('TWENTY_APP_ACCESS_TOKEN is required');
  }

  return { apiBaseUrl, appToken };
};

const metadataGraphqlRequest = async ({
  query,
  variables,
}: {
  query: string;
  variables?: Record<string, unknown>;
}): Promise<unknown> => {
  const { apiBaseUrl, appToken } = getApiConfig();

  const response = await fetch(`${apiBaseUrl}/metadata`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${appToken}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(
      `Metadata GraphQL request failed (${response.status}): ${await response.text()}`,
    );
  }

  const payload: unknown = await response.json();

  if (!isRecord(payload)) {
    throw new Error('Metadata GraphQL response had an unexpected shape');
  }

  if (payload.errors !== undefined) {
    if (
      !Array.isArray(payload.errors) ||
      !payload.errors.every(isGraphqlError)
    ) {
      throw new Error('Metadata GraphQL errors had an unexpected shape');
    }

    throw new Error(
      `Metadata GraphQL errors: ${payload.errors
        .map((error) => error.message)
        .join('; ')}`,
    );
  }

  if (payload.data === undefined) {
    throw new Error('Metadata GraphQL response did not include data');
  }

  return payload.data;
};

const findObjectField = ({
  objectMetadata,
  fieldName,
}: {
  objectMetadata: ObjectMetadataRecord;
  fieldName: string;
}) =>
  objectMetadata.fieldsList.find(
    (fieldMetadata) => fieldMetadata.name === fieldName,
  );

const findExistingActiveSort = ({
  view,
  fieldMetadataId,
}: {
  view: ViewRecord;
  fieldMetadataId: string;
}) =>
  view.viewSorts.find(
    (viewSort) =>
      viewSort.fieldMetadataId === fieldMetadataId &&
      (viewSort.deletedAt === null || viewSort.deletedAt === undefined),
  );

const createDescendingViewSort = async ({
  viewId,
  fieldMetadataId,
}: {
  viewId: string;
  fieldMetadataId: string;
}) => {
  await metadataGraphqlRequest({
    query: CREATE_VIEW_SORT_MUTATION,
    variables: {
      input: {
        viewId,
        fieldMetadataId,
        direction: 'DESC',
      },
    },
  });
};

const updateViewSortToDescending = async (viewSortId: string) => {
  await metadataGraphqlRequest({
    query: UPDATE_VIEW_SORT_MUTATION,
    variables: {
      input: {
        id: viewSortId,
        update: {
          direction: 'DESC',
        },
      },
    },
  });
};

const updateFieldRequiredCondition = async ({
  fieldMetadataId,
  requiredCondition,
}: {
  fieldMetadataId: string;
  requiredCondition: RequiredCondition;
}) => {
  await metadataGraphqlRequest({
    query: UPDATE_FIELD_REQUIRED_CONDITION_MUTATION,
    variables: {
      input: {
        id: fieldMetadataId,
        update: {
          requiredCondition,
        },
      },
    },
  });
};

const updateFieldDefaultValue = async ({
  fieldMetadataId,
  defaultValue,
}: {
  fieldMetadataId: string;
  defaultValue: string;
}) => {
  await metadataGraphqlRequest({
    query: UPDATE_FIELD_REQUIRED_CONDITION_MUTATION,
    variables: {
      input: {
        id: fieldMetadataId,
        update: {
          defaultValue,
        },
      },
    },
  });
};

const upsertObjectPermissions = async ({
  roleId,
  objectPermissions,
}: {
  roleId: string;
  objectPermissions: ObjectPermissionRecord[];
}) => {
  await metadataGraphqlRequest({
    query: UPSERT_OBJECT_PERMISSIONS_MUTATION,
    variables: {
      upsertObjectPermissionsInput: {
        roleId,
        objectPermissions,
      },
    },
  });
};

const upsertRowLevelPermissionPredicates = async ({
  roleId,
  objectMetadataId,
  predicates,
  predicateGroups,
}: {
  roleId: string;
  objectMetadataId: string;
  predicates: RowLevelPermissionPredicateRecord[];
  predicateGroups: RowLevelPermissionPredicateGroupRecord[];
}) => {
  const predicateInputs = predicates.map(
    ({ objectMetadataId: _objectMetadataId, ...predicate }) =>
      predicate satisfies RowLevelPermissionPredicateInput,
  );

  await metadataGraphqlRequest({
    query: UPSERT_ROW_LEVEL_PERMISSION_PREDICATES_MUTATION,
    variables: {
      input: {
        roleId,
        objectMetadataId,
        predicates: predicateInputs,
        predicateGroups,
      },
    },
  });
};

const ensureViewSortTarget = async ({
  target,
  objects,
  views,
}: {
  target: ViewSortTarget;
  objects: ObjectMetadataRecord[];
  views: ViewRecord[];
}): Promise<ViewSortSetupResult> => {
  const result: ViewSortSetupResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: [],
  };

  const objectMetadata = objects.find(
    (candidate) => candidate.nameSingular === target.objectNameSingular,
  );

  if (objectMetadata === undefined) {
    result.skipped.push(
      `${target.objectNameSingular}: object metadata was not found`,
    );

    return result;
  }

  const fieldMetadata = findObjectField({
    objectMetadata,
    fieldName: target.fieldName,
  });

  if (fieldMetadata === undefined) {
    result.skipped.push(
      `${target.objectNameSingular}.${target.fieldName}: field metadata was not found`,
    );

    return result;
  }

  const matchingViews = views.filter(
    (view) =>
      view.objectMetadataId === objectMetadata.id &&
      view.visibility === 'WORKSPACE' &&
      target.viewNames.includes(view.name),
  );

  for (const view of matchingViews) {
    try {
      const existingSort = findExistingActiveSort({
        view,
        fieldMetadataId: fieldMetadata.id,
      });

      if (existingSort === undefined) {
        await createDescendingViewSort({
          viewId: view.id,
          fieldMetadataId: fieldMetadata.id,
        });
        result.created += 1;
        continue;
      }

      if (existingSort.direction !== 'DESC') {
        await updateViewSortToDescending(existingSort.id);
        result.updated += 1;
        continue;
      }

      result.unchanged += 1;
    } catch (error) {
      if (!isViewModificationPermissionError(error)) {
        throw error;
      }

      result.skipped.push(
        `${view.name}: view sort skipped because view modification is not permitted`,
      );

      continue;
    }
  }

  return result;
};

const mergeResults = (
  currentResult: ViewSortSetupResult,
  nextResult: ViewSortSetupResult,
): ViewSortSetupResult => ({
  created: currentResult.created + nextResult.created,
  updated: currentResult.updated + nextResult.updated,
  unchanged: currentResult.unchanged + nextResult.unchanged,
  skipped: [...currentResult.skipped, ...nextResult.skipped],
});

const ensureBrokerageViewSorts = async ({
  objects,
  views,
}: {
  objects: ObjectMetadataRecord[];
  views: ViewRecord[];
}): Promise<ViewSortSetupResult> => {
  let result: ViewSortSetupResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: [],
  };

  for (const target of VIEW_SORT_TARGETS) {
    result = mergeResults(
      result,
      await ensureViewSortTarget({
        target,
        objects,
        views,
      }),
    );
  }

  return result;
};

const mergeSetupResults = (
  currentResult: SetupResult,
  nextResult: SetupResult,
): SetupResult => ({
  updated: currentResult.updated + nextResult.updated,
  unchanged: currentResult.unchanged + nextResult.unchanged,
  skipped: [...currentResult.skipped, ...nextResult.skipped],
});

const ensureRequiredConditionForField = async ({
  objectMetadata,
  fieldName,
  requiredCondition,
  result,
}: {
  objectMetadata: ObjectMetadataRecord;
  fieldName: string;
  requiredCondition: RequiredCondition;
  result: SetupResult;
}) => {
  const fieldMetadata = findObjectField({
    objectMetadata,
    fieldName,
  });

  if (fieldMetadata === undefined) {
    result.skipped.push(
      `${objectMetadata.nameSingular}.${fieldName}: field metadata was not found`,
    );

    return;
  }

  if (
    areRequiredConditionsEqual({
      currentCondition: fieldMetadata.requiredCondition,
      targetCondition: requiredCondition,
    })
  ) {
    result.unchanged += 1;

    return;
  }

  await updateFieldRequiredCondition({
    fieldMetadataId: fieldMetadata.id,
    requiredCondition,
  });
  result.updated += 1;
};

const ensureAlwaysRequiredFieldsForObject = async ({
  objects,
  objectNameSingular,
  fieldNames,
}: {
  objects: ObjectMetadataRecord[];
  objectNameSingular: string;
  fieldNames: string[];
}): Promise<SetupResult> => {
  const result: SetupResult = {
    updated: 0,
    unchanged: 0,
    skipped: [],
  };

  const objectMetadata = objects.find(
    (candidate) => candidate.nameSingular === objectNameSingular,
  );

  if (objectMetadata === undefined) {
    result.skipped.push(`${objectNameSingular}: object metadata was not found`);

    return result;
  }

  for (const fieldName of fieldNames) {
    await ensureRequiredConditionForField({
      objectMetadata,
      fieldName,
      requiredCondition: ALWAYS_REQUIRED_CONDITION,
      result,
    });
  }

  return result;
};

const ensurePolicyIdentifierRequiredConditions = async (
  objects: ObjectMetadataRecord[],
): Promise<SetupResult> => {
  const result: SetupResult = {
    updated: 0,
    unchanged: 0,
    skipped: [],
  };

  const policyObject = objects.find(
    (objectMetadata) => objectMetadata.nameSingular === 'policy',
  );

  if (policyObject === undefined) {
    result.skipped.push('policy: object metadata was not found');

    return result;
  }

  const policyNumberFieldMetadata = findObjectField({
    objectMetadata: policyObject,
    fieldName: POLICY_APPLICATION_ID_DEPENDENCY_FIELD_NAME,
  });

  if (policyNumberFieldMetadata === undefined) {
    result.skipped.push(
      `policy.${POLICY_APPLICATION_ID_DEPENDENCY_FIELD_NAME}: field metadata was not found`,
    );

    return result;
  }

  const applicationIdFieldMetadata = findObjectField({
    objectMetadata: policyObject,
    fieldName: POLICY_POLICY_NUMBER_DEPENDENCY_FIELD_NAME,
  });

  if (applicationIdFieldMetadata === undefined) {
    result.skipped.push(
      `policy.${POLICY_POLICY_NUMBER_DEPENDENCY_FIELD_NAME}: field metadata was not found`,
    );

    return result;
  }

  await ensureRequiredConditionForField({
    objectMetadata: policyObject,
    fieldName: POLICY_APPLICATION_ID_FIELD_NAME,
    requiredCondition: {
      type: 'fieldEmpty',
      fieldId: policyNumberFieldMetadata.id,
    },
    result,
  });

  await ensureRequiredConditionForField({
    objectMetadata: policyObject,
    fieldName: POLICY_POLICY_NUMBER_FIELD_NAME,
    requiredCondition: {
      type: 'fieldEmpty',
      fieldId: applicationIdFieldMetadata.id,
    },
    result,
  });

  return result;
};

const ensureFieldDefaultValue = async ({
  objects,
  objectNameSingular,
  fieldName,
  defaultValue,
}: {
  objects: ObjectMetadataRecord[];
  objectNameSingular: string;
  fieldName: string;
  defaultValue: string;
}): Promise<SetupResult> => {
  const result: SetupResult = {
    updated: 0,
    unchanged: 0,
    skipped: [],
  };

  const objectMetadata = objects.find(
    (candidate) => candidate.nameSingular === objectNameSingular,
  );

  if (objectMetadata === undefined) {
    result.skipped.push(`${objectNameSingular}: object metadata was not found`);

    return result;
  }

  const fieldMetadata = findObjectField({
    objectMetadata,
    fieldName,
  });

  if (fieldMetadata === undefined) {
    result.skipped.push(
      `${objectNameSingular}.${fieldName}: field metadata was not found`,
    );

    return result;
  }

  if (fieldMetadata.defaultValue === defaultValue) {
    result.unchanged += 1;

    return result;
  }

  await updateFieldDefaultValue({
    fieldMetadataId: fieldMetadata.id,
    defaultValue,
  });
  result.updated += 1;

  return result;
};

const ensureBrokerageRequiredFields = async (
  objects: ObjectMetadataRecord[],
): Promise<SetupResult> => {
  let result: SetupResult = {
    updated: 0,
    unchanged: 0,
    skipped: [],
  };

  result = mergeSetupResults(
    result,
    await ensureAlwaysRequiredFieldsForObject({
      objects,
      objectNameSingular: 'person',
      fieldNames: REQUIRED_LEAD_FIELD_NAMES,
    }),
  );

  result = mergeSetupResults(
    result,
    await ensureAlwaysRequiredFieldsForObject({
      objects,
      objectNameSingular: 'policy',
      fieldNames: REQUIRED_POLICY_FIELD_NAMES,
    }),
  );

  result = mergeSetupResults(
    result,
    await ensurePolicyIdentifierRequiredConditions(objects),
  );

  result = mergeSetupResults(
    result,
    await ensureFieldDefaultValue({
      objects,
      objectNameSingular: 'person',
      fieldName: LEAD_STATUS_FIELD_NAME,
      defaultValue: LEAD_STATUS_DEFAULT_VALUE,
    }),
  );

  result = mergeSetupResults(
    result,
    await ensureFieldDefaultValue({
      objects,
      objectNameSingular: 'policy',
      fieldName: POLICY_STATUS_FIELD_NAME,
      defaultValue: POLICY_STATUS_DEFAULT_VALUE,
    }),
  );

  return result;
};

const findObjectMetadata = ({
  objects,
  objectNameSingular,
}: {
  objects: ObjectMetadataRecord[];
  objectNameSingular: string;
}) =>
  objects.find((candidate) => candidate.nameSingular === objectNameSingular);

const findAgentRole = (roles: RoleRecord[]) =>
  roles.find(
    (role) =>
      role.universalIdentifier === BROKERAGE_AGENT_ROLE_UNIVERSAL_IDENTIFIER,
  ) ?? roles.find((role) => role.label === AGENT_ROLE_LABEL);

const normalizeObjectPermission = (
  objectPermission: ObjectPermissionRecord,
): ObjectPermissionRecord => ({
  objectMetadataId: objectPermission.objectMetadataId,
  canReadObjectRecords: objectPermission.canReadObjectRecords ?? undefined,
  canUpdateObjectRecords: objectPermission.canUpdateObjectRecords ?? undefined,
  canSoftDeleteObjectRecords:
    objectPermission.canSoftDeleteObjectRecords ?? undefined,
  canDestroyObjectRecords:
    objectPermission.canDestroyObjectRecords ?? undefined,
});

const arePolicyObjectPermissionsConfigured = (
  objectPermission: ObjectPermissionRecord | undefined,
) =>
  objectPermission?.canReadObjectRecords === true &&
  objectPermission.canUpdateObjectRecords === true &&
  objectPermission.canSoftDeleteObjectRecords !== true &&
  objectPermission.canDestroyObjectRecords !== true;

const ensureAgentPolicyObjectPermission = async ({
  agentRole,
  policyObjectMetadata,
  result,
}: {
  agentRole: RoleRecord;
  policyObjectMetadata: ObjectMetadataRecord;
  result: SetupResult;
}) => {
  const existingObjectPermissions = agentRole.objectPermissions ?? [];
  const existingPolicyPermission = existingObjectPermissions.find(
    (objectPermission) =>
      objectPermission.objectMetadataId === policyObjectMetadata.id,
  );

  if (arePolicyObjectPermissionsConfigured(existingPolicyPermission)) {
    result.unchanged += 1;

    return;
  }

  const objectPermissionsByObjectMetadataId = new Map(
    existingObjectPermissions.map((objectPermission) => [
      objectPermission.objectMetadataId,
      normalizeObjectPermission(objectPermission),
    ]),
  );

  objectPermissionsByObjectMetadataId.set(policyObjectMetadata.id, {
    objectMetadataId: policyObjectMetadata.id,
    canReadObjectRecords: true,
    canUpdateObjectRecords: true,
  });

  await upsertObjectPermissions({
    roleId: agentRole.id,
    objectPermissions: Array.from(objectPermissionsByObjectMetadataId.values()),
  });

  result.updated += 1;
};

const isAgentPolicyWritePredicate = ({
  predicate,
  policyObjectMetadataId,
  policyAgentFieldMetadataId,
  workspaceMemberIdFieldMetadataId,
}: {
  predicate: RowLevelPermissionPredicateRecord;
  policyObjectMetadataId: string;
  policyAgentFieldMetadataId: string;
  workspaceMemberIdFieldMetadataId: string;
}) =>
  predicate.objectMetadataId === policyObjectMetadataId &&
  predicate.fieldMetadataId === policyAgentFieldMetadataId &&
  predicate.scope === 'WRITE' &&
  predicate.operand === 'IS' &&
  predicate.workspaceMemberFieldMetadataId ===
    workspaceMemberIdFieldMetadataId &&
  (predicate.workspaceMemberSubFieldName === null ||
    predicate.workspaceMemberSubFieldName === undefined);

const isAgentPolicyWritePredicateConfigured = ({
  predicate,
  policyObjectMetadataId,
  policyAgentFieldMetadataId,
  workspaceMemberIdFieldMetadataId,
}: {
  predicate: RowLevelPermissionPredicateRecord | undefined;
  policyObjectMetadataId: string;
  policyAgentFieldMetadataId: string;
  workspaceMemberIdFieldMetadataId: string;
}) =>
  predicate !== undefined &&
  isAgentPolicyWritePredicate({
    predicate,
    policyObjectMetadataId,
    policyAgentFieldMetadataId,
    workspaceMemberIdFieldMetadataId,
  }) &&
  predicate.value === WORKSPACE_MEMBER_DYNAMIC_VALUE &&
  (predicate.subFieldName === null || predicate.subFieldName === undefined) &&
  (predicate.rowLevelPermissionPredicateGroupId === null ||
    predicate.rowLevelPermissionPredicateGroupId === undefined) &&
  (predicate.positionInRowLevelPermissionPredicateGroup === null ||
    predicate.positionInRowLevelPermissionPredicateGroup === undefined);

const ensureAgentPolicyRowLevelPredicate = async ({
  agentRole,
  policyObjectMetadata,
  policyAgentFieldMetadata,
  workspaceMemberIdFieldMetadata,
  result,
}: {
  agentRole: RoleRecord;
  policyObjectMetadata: ObjectMetadataRecord;
  policyAgentFieldMetadata: ObjectFieldRecord;
  workspaceMemberIdFieldMetadata: ObjectFieldRecord;
  result: SetupResult;
}) => {
  const existingPolicyPredicates = (
    agentRole.rowLevelPermissionPredicates ?? []
  ).filter(
    (predicate) => predicate.objectMetadataId === policyObjectMetadata.id,
  );
  const existingPolicyPredicateGroups = (
    agentRole.rowLevelPermissionPredicateGroups ?? []
  ).filter((group) => group.objectMetadataId === policyObjectMetadata.id);
  const matchingPredicates = existingPolicyPredicates.filter((predicate) =>
    isAgentPolicyWritePredicate({
      predicate,
      policyObjectMetadataId: policyObjectMetadata.id,
      policyAgentFieldMetadataId: policyAgentFieldMetadata.id,
      workspaceMemberIdFieldMetadataId: workspaceMemberIdFieldMetadata.id,
    }),
  );
  const primaryPredicate = matchingPredicates[0];

  if (
    matchingPredicates.length === 1 &&
    isAgentPolicyWritePredicateConfigured({
      predicate: primaryPredicate,
      policyObjectMetadataId: policyObjectMetadata.id,
      policyAgentFieldMetadataId: policyAgentFieldMetadata.id,
      workspaceMemberIdFieldMetadataId: workspaceMemberIdFieldMetadata.id,
    })
  ) {
    result.unchanged += 1;

    return;
  }

  const duplicatePredicateIds = new Set(
    matchingPredicates.slice(1).map((predicate) => predicate.id),
  );
  const predicatesToPreserve = existingPolicyPredicates.filter(
    (predicate) =>
      predicate.id !== primaryPredicate?.id &&
      !duplicatePredicateIds.has(predicate.id),
  );

  await upsertRowLevelPermissionPredicates({
    roleId: agentRole.id,
    objectMetadataId: policyObjectMetadata.id,
    predicates: [
      ...predicatesToPreserve,
      {
        id: primaryPredicate?.id ?? undefined,
        fieldMetadataId: policyAgentFieldMetadata.id,
        objectMetadataId: policyObjectMetadata.id,
        operand: 'IS',
        scope: 'WRITE',
        value: WORKSPACE_MEMBER_DYNAMIC_VALUE,
        subFieldName: null,
        workspaceMemberFieldMetadataId: workspaceMemberIdFieldMetadata.id,
        workspaceMemberSubFieldName: null,
        rowLevelPermissionPredicateGroupId: null,
        positionInRowLevelPermissionPredicateGroup: null,
      },
    ],
    predicateGroups: existingPolicyPredicateGroups,
  });

  result.updated += 1;
};

const ensureAgentPolicyOwnershipRls = async ({
  objects,
  roles,
}: {
  objects: ObjectMetadataRecord[];
  roles: RoleRecord[];
}): Promise<SetupResult> => {
  const result: SetupResult = {
    updated: 0,
    unchanged: 0,
    skipped: [],
  };
  const agentRole = findAgentRole(roles);
  const policyObjectMetadata = findObjectMetadata({
    objects,
    objectNameSingular: 'policy',
  });
  const workspaceMemberObjectMetadata = findObjectMetadata({
    objects,
    objectNameSingular: WORKSPACE_MEMBER_OBJECT_NAME,
  });

  if (agentRole === undefined) {
    result.skipped.push('Agent role was not found');

    return result;
  }

  if (policyObjectMetadata === undefined) {
    result.skipped.push('policy: object metadata was not found');

    return result;
  }

  if (workspaceMemberObjectMetadata === undefined) {
    result.skipped.push('workspaceMember: object metadata was not found');

    return result;
  }

  const policyAgentFieldMetadata = findObjectField({
    objectMetadata: policyObjectMetadata,
    fieldName: AGENT_RELATION_FIELD_NAME,
  });
  const workspaceMemberIdFieldMetadata = findObjectField({
    objectMetadata: workspaceMemberObjectMetadata,
    fieldName: WORKSPACE_MEMBER_ID_FIELD_NAME,
  });

  if (policyAgentFieldMetadata === undefined) {
    result.skipped.push('policy.agent: field metadata was not found');

    return result;
  }

  if (workspaceMemberIdFieldMetadata === undefined) {
    result.skipped.push('workspaceMember.id: field metadata was not found');

    return result;
  }

  await ensureAgentPolicyObjectPermission({
    agentRole,
    policyObjectMetadata,
    result,
  });

  await ensureAgentPolicyRowLevelPredicate({
    agentRole,
    policyObjectMetadata,
    policyAgentFieldMetadata,
    workspaceMemberIdFieldMetadata,
    result,
  });

  return result;
};

const ensureBrokerageSetup = async (): Promise<BrokeragePostInstallResult> => {
  const data = await metadataGraphqlRequest({
    query: FIND_VIEW_SORT_SETUP_QUERY,
  });

  if (!isFindViewSortSetupData(data)) {
    throw new Error('Brokerage post-install setup query returned invalid data');
  }

  const objects = data.objects.edges.map((edge) => edge.node);

  return {
    viewSorts: await ensureBrokerageViewSorts({
      objects,
      views: data.getViews,
    }),
    requiredFields: await ensureBrokerageRequiredFields(objects),
    agentPolicyRls: await ensureAgentPolicyOwnershipRls({
      objects,
      roles: data.getRoles,
    }),
  };
};

const handler = async (
  _payload: InstallPayload,
): Promise<BrokeragePostInstallResult> => ensureBrokerageSetup();

export default definePostInstallLogicFunction({
  universalIdentifier: 'b8ccd0f8-8497-463f-87c2-61b55b2ecf4a',
  name: 'post-install',
  description:
    'Ensures Brokerage workspace views and required fields are normalized.',
  timeoutSeconds: 60,
  shouldRunOnVersionUpgrade: true,
  shouldRunSynchronously: true,
  handler,
});
