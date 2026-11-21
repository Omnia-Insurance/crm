import { currentUserWorkspaceState } from '@/auth/states/currentUserWorkspaceState';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { useRequiredConditionViolations } from '@/object-record/record-form/hooks/useRequiredConditionViolations';
import { renderHook } from '@testing-library/react';
import { print, type DocumentNode } from 'graphql';
import { createStore, Provider } from 'jotai';
import { type ReactNode } from 'react';
import { type RequiredCondition } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

const mockQuery = jest.fn();
let mockObjectMetadataItems: EnrichedObjectMetadataItem[] = [];

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => ({ query: mockQuery }),
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: mockObjectMetadataItems,
  }),
}));

const ALWAYS_REQUIRED: RequiredCondition = { type: 'always' };

const withRequiredFields = (
  objectMetadataItem: EnrichedObjectMetadataItem,
  requiredFieldNames: string[],
): EnrichedObjectMetadataItem => ({
  ...objectMetadataItem,
  fields: objectMetadataItem.fields.map((field) =>
    requiredFieldNames.includes(field.name)
      ? { ...field, requiredCondition: ALWAYS_REQUIRED }
      : field,
  ),
});

const getField = (
  objectMetadataItem: EnrichedObjectMetadataItem,
  fieldName: string,
): FieldMetadataItem => {
  const field = objectMetadataItem.fields.find(
    (candidate) => candidate.name === fieldName,
  );

  if (!isDefined(field)) {
    throw new Error(`Missing mock field ${fieldName}`);
  }

  return field;
};

const opportunity = getMockObjectMetadataItemOrThrow('opportunity');
const person = withRequiredFields(getMockObjectMetadataItemOrThrow('person'), [
  'name',
]);

const pointOfContactField = getField(opportunity, 'pointOfContact');
const opportunityNameField = getField(opportunity, 'name');
const personNameField = getField(person, 'name');

const LINKED_PERSON_RESPONSE = {
  data: {
    people: {
      edges: [
        {
          cursor: 'cursor',
          node: {
            __typename: 'Person',
            id: 'person-id',
            name: { __typename: 'FullName', firstName: '', lastName: '' },
          },
        },
      ],
      pageInfo: {
        hasNextPage: false,
        hasPreviousPage: false,
        startCursor: 'cursor',
        endCursor: 'cursor',
      },
      totalCount: 1,
    },
  },
};

const renderUseRequiredConditionViolations = ({
  objectMetadataItem,
  unreadablePersonFieldIds = [],
}: {
  objectMetadataItem: EnrichedObjectMetadataItem;
  unreadablePersonFieldIds?: string[];
}) => {
  const store = createStore();

  store.set(currentUserWorkspaceState.atom, {
    objectRecordsPermissions: [
      {
        objectMetadataId: person.id,
        canCreateAllRecords: true,
        canReadAllRecords: true,
        canUpdateAllRecords: true,
        canSoftDeleteAllRecords: true,
        canDestroyAllRecords: true,
        unreadableFields: unreadablePersonFieldIds,
        uneditableFields: [],
      },
    ],
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );

  return renderHook(
    () => useRequiredConditionViolations({ objectMetadataItem }),
    { wrapper },
  );
};

describe('useRequiredConditionViolations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockObjectMetadataItems = [opportunity, person];
  });

  it('reports required fields the draft leaves empty', () => {
    const { result } = renderUseRequiredConditionViolations({
      objectMetadataItem: withRequiredFields(opportunity, ['name']),
    });

    expect(result.current.hasRequiredConditions).toBe(true);
    expect(result.current.computeRequiredConditionViolations({})).toEqual([
      expect.objectContaining({
        fieldMetadataId: opportunityNameField.id,
        message: `${opportunityNameField.label} is required`,
      }),
    ]);
  });

  it('has nothing to check on an object without required conditions', () => {
    const { result } = renderUseRequiredConditionViolations({
      objectMetadataItem: opportunity,
    });

    expect(result.current.hasRequiredConditions).toBe(false);
    expect(result.current.computeRequiredConditionViolations({})).toEqual([]);
  });

  it('loads the linked record through the record query, asking only for what its rules read', async () => {
    mockQuery.mockResolvedValue(LINKED_PERSON_RESPONSE);

    const { result } = renderUseRequiredConditionViolations({
      objectMetadataItem: opportunity,
    });

    await expect(
      result.current.computeRelatedRecordRequiredConditionViolations({
        pointOfContactId: 'person-id',
      }),
    ).resolves.toEqual([
      {
        ruleId: `required-condition:${pointOfContactField.id}:${personNameField.id}`,
        fieldMetadataId: null,
        message: `${pointOfContactField.label}: ${personNameField.label} is required. Open the ${pointOfContactField.label.toLowerCase()} to complete it.`,
      },
    ]);

    expect(mockQuery).toHaveBeenCalledTimes(1);

    const [{ query, variables, fetchPolicy }] = mockQuery.mock.calls[0] as [
      {
        query: DocumentNode;
        variables: Record<string, unknown>;
        fetchPolicy: string;
      },
    ];
    const printedQuery = print(query);

    expect(variables).toEqual({
      filter: { id: { eq: 'person-id' } },
      limit: 1,
    });
    expect(fetchPolicy).toBe('network-only');
    expect(printedQuery).toContain('firstName');
    expect(printedQuery).not.toContain('emails');
    expect(printedQuery).not.toContain('jobTitle');
  });

  it('never loads a field the member cannot read', async () => {
    const { result } = renderUseRequiredConditionViolations({
      objectMetadataItem: opportunity,
      unreadablePersonFieldIds: [personNameField.id],
    });

    await expect(
      result.current.computeRelatedRecordRequiredConditionViolations({
        pointOfContactId: 'person-id',
      }),
    ).resolves.toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('lets Create go ahead when the linked record cannot be loaded', async () => {
    mockQuery.mockRejectedValue(new Error('Network error'));

    const { result } = renderUseRequiredConditionViolations({
      objectMetadataItem: opportunity,
    });

    await expect(
      result.current.computeRelatedRecordRequiredConditionViolations({
        pointOfContactId: 'person-id',
      }),
    ).resolves.toEqual([]);
  });
});
