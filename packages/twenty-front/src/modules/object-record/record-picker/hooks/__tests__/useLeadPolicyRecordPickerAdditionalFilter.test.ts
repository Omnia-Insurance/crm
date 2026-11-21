import { act, renderHook } from '@testing-library/react';
import { QUERY_MAX_RECORDS } from 'twenty-shared/constants';

import {
  buildIdAllowlistFilter,
  buildRelationPickerEligibleRecordsFilter,
  useLeadPolicyRecordPickerAdditionalFilter,
} from '@/object-record/record-picker/hooks/useLeadPolicyRecordPickerAdditionalFilter';

const mockUseFindManyRecords = jest.fn();
const mockFetchMoreRecords = jest.fn();

jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: (params: unknown) => mockUseFindManyRecords(params),
}));

const SENTINEL_ID = '00000000-0000-0000-0000-000000000000';
const LEAD_ID = 'lead-id';

const mockEligiblePolicies = ({
  records,
  loading = false,
  hasNextPage = false,
}: {
  records: { id: string }[];
  loading?: boolean;
  hasNextPage?: boolean;
}) =>
  mockUseFindManyRecords.mockReturnValue({
    records,
    loading,
    error: undefined,
    pageInfo: { hasNextPage },
    fetchMoreRecords: mockFetchMoreRecords,
    queryIdentifier: 'lead-eligible-policies-query',
  });

const renderLeadPolicyFilterHook = ({
  inverseFieldName = 'lead',
  relationObjectMetadataNameSingular = 'policy',
}: {
  inverseFieldName?: string;
  relationObjectMetadataNameSingular?: string;
} = {}) =>
  renderHook(() =>
    useLeadPolicyRecordPickerAdditionalFilter({
      recordId: LEAD_ID,
      inverseFieldName,
      relationObjectMetadataNameSingular,
    }),
  );

describe('buildIdAllowlistFilter', () => {
  it('allows only the eligible record ids', () => {
    expect(buildIdAllowlistFilter(['policy-1', 'policy-2'])).toEqual({
      id: { in: ['policy-1', 'policy-2'] },
    });
  });

  it('matches nothing when no record is eligible', () => {
    expect(buildIdAllowlistFilter([])).toEqual({ id: { eq: SENTINEL_ID } });
  });

  it('filters on id only, the one record field the search API accepts', () => {
    expect(Object.keys(buildIdAllowlistFilter(['policy-1']))).toEqual(['id']);
  });
});

describe('buildRelationPickerEligibleRecordsFilter', () => {
  it('keeps records without a parent or already on this parent', () => {
    expect(
      buildRelationPickerEligibleRecordsFilter({
        inverseFieldName: 'lead',
        recordId: LEAD_ID,
      }),
    ).toEqual({
      or: [{ leadId: { is: 'NULL' } }, { leadId: { eq: LEAD_ID } }],
    });
  });

  it('uses the join column of the inverse relation', () => {
    expect(
      buildRelationPickerEligibleRecordsFilter({
        inverseFieldName: 'agent',
        recordId: 'agent-id',
      }),
    ).toEqual({
      or: [{ agentId: { is: 'NULL' } }, { agentId: { eq: 'agent-id' } }],
    });
  });
});

describe('useLeadPolicyRecordPickerAdditionalFilter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchMoreRecords.mockResolvedValue({ data: {} });
    mockEligiblePolicies({ records: [] });
  });

  it('fetches only the ids of policies without a lead or on this lead', () => {
    renderLeadPolicyFilterHook();

    expect(mockUseFindManyRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        objectNameSingular: 'policy',
        filter: {
          or: [{ leadId: { is: 'NULL' } }, { leadId: { eq: LEAD_ID } }],
        },
        recordGqlFields: { id: true },
        skip: false,
        limit: QUERY_MAX_RECORDS,
      }),
    );
  });

  it('allows only the eligible policies once they are loaded', () => {
    mockEligiblePolicies({
      records: [{ id: 'unlinked-policy' }, { id: 'policy-on-this-lead' }],
    });

    const { result } = renderLeadPolicyFilterHook();

    expect(result.current).toEqual({
      additionalFilter: {
        id: { in: ['unlinked-policy', 'policy-on-this-lead'] },
      },
      isLeadPolicyRelation: true,
      loading: false,
    });
  });

  it('offers no policy while the allowlist is loading', () => {
    mockEligiblePolicies({ records: [], loading: true });

    const { result } = renderLeadPolicyFilterHook();

    expect(result.current).toEqual({
      additionalFilter: { id: { eq: SENTINEL_ID } },
      isLeadPolicyRelation: true,
      loading: true,
    });
  });

  it('leaves other relations unfiltered and skips the query', () => {
    mockEligiblePolicies({ records: [], loading: true });

    const { result } = renderLeadPolicyFilterHook({
      inverseFieldName: 'carrier',
    });

    expect(mockUseFindManyRecords).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    );
    expect(result.current).toEqual({
      additionalFilter: undefined,
      isLeadPolicyRelation: false,
      loading: false,
    });
  });

  it('allows every eligible policy, past one server page', () => {
    const eligiblePolicies = Array.from(
      { length: QUERY_MAX_RECORDS + 50 },
      (_, index) => ({ id: `policy-${index}` }),
    );

    mockEligiblePolicies({ records: eligiblePolicies });

    const { result } = renderLeadPolicyFilterHook();

    expect(result.current.additionalFilter).toEqual({
      id: { in: eligiblePolicies.map(({ id }) => id) },
    });
    expect(result.current.loading).toBe(false);
  });

  it('keeps loading and fetches the next page while more eligible policies remain', async () => {
    mockEligiblePolicies({
      records: Array.from({ length: QUERY_MAX_RECORDS }, (_, index) => ({
        id: `policy-${index}`,
      })),
      hasNextPage: true,
    });

    const { result } = renderLeadPolicyFilterHook();

    await act(async () => {});

    expect(mockFetchMoreRecords).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(true);
  });
});
