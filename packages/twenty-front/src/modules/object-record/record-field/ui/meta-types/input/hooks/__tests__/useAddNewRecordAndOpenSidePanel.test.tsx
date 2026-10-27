import { act, renderHook } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';

import { useAddNewRecordAndOpenSidePanel } from '@/object-record/record-field/ui/meta-types/input/hooks/useAddNewRecordAndOpenSidePanel';
import { usePersistDraftRecord } from '@/object-record/record-side-panel/hooks/usePersistDraftRecord';
import { draftRecordIdsState } from '@/object-record/record-side-panel/states/draftRecordIdsState';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

const createdInputs: { objectNameSingular: string; input: ObjectRecord }[] =
  [];
const mockUpdateOneRecord = jest.fn();

jest.mock('@/object-record/hooks/useCreateOneRecord', () => ({
  useCreateOneRecord: ({
    objectNameSingular,
  }: {
    objectNameSingular: string;
  }) => ({
    createOneRecord: async (input: ObjectRecord) => {
      createdInputs.push({ objectNameSingular, input });
      return { ...input, __typename: objectNameSingular };
    },
  }),
}));

jest.mock('@/object-record/hooks/useUpdateOneRecord', () => ({
  useUpdateOneRecord: () => ({ updateOneRecord: mockUpdateOneRecord }),
}));

jest.mock('@/object-record/hooks/useDraftRecordDefaults', () => ({
  useDraftRecordDefaults: () => ({
    buildDraftSeeds: () => ({ seedValues: {}, rlsFieldNames: [] }),
  }),
}));

jest.mock('@/object-record/record-store/hooks/useUpsertRecordsInStore', () => ({
  useUpsertRecordsInStore: () => ({ upsertRecordsInStore: jest.fn() }),
}));

jest.mock('@/side-panel/hooks/useOpenRecordInSidePanel', () => ({
  useOpenRecordInSidePanel: () => ({ openRecordInSidePanel: jest.fn() }),
}));

jest.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => ({ refetchQueries: jest.fn() }),
}));

const person = getMockObjectMetadataItemOrThrow('person');
const opportunity = getMockObjectMetadataItemOrThrow('opportunity');

const getField = (objectMetadataItem: typeof person, fieldName: string) => {
  const field = objectMetadataItem.fields.find(
    (candidate) => candidate.name === fieldName,
  );

  if (field === undefined) {
    throw new Error(`Missing mock field ${fieldName}`);
  }

  return field;
};

const personOpportunitiesField = getField(
  person,
  'pointOfContactForOpportunities',
);
const opportunityPointOfContactField = getField(opportunity, 'pointOfContact');

const seedDraft = (
  store: ReturnType<typeof createStore>,
  record: ObjectRecord,
  objectMetadataItem: typeof person,
) => {
  store.set(recordStoreFamilyState.atomFamily(record.id), record);
  store.set(
    draftRecordIdsState.atom,
    new Map(store.get(draftRecordIdsState.atom)).set(record.id, {
      objectNameSingular: objectMetadataItem.nameSingular,
      objectMetadataItem,
      hiddenFieldNames: new Set(),
      extraRecordInput: {},
    }),
  );
};

const renderHooks = (
  store: ReturnType<typeof createStore>,
  props: Parameters<typeof useAddNewRecordAndOpenSidePanel>[0],
) => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <JotaiProvider store={store}>{children}</JotaiProvider>
  );

  return renderHook(
    () => ({
      addNew: useAddNewRecordAndOpenSidePanel(props),
      persistDraft: usePersistDraftRecord({
        objectNameSingular: props.relationObjectMetadataNameSingular,
      }),
    }),
    { wrapper },
  );
};

const getNewDraftId = (
  store: ReturnType<typeof createStore>,
  excludedId: string,
) => {
  const newDraftId = [...store.get(draftRecordIdsState.atom).keys()].find(
    (id) => id !== excludedId,
  );

  if (newDraftId === undefined) {
    throw new Error('No new draft was registered');
  }

  return newDraftId;
};

describe('useAddNewRecordAndOpenSidePanel with an unsaved source record', () => {
  beforeEach(() => {
    createdInputs.length = 0;
    mockUpdateOneRecord.mockReset();
  });

  it('saves the unsaved parent before the child that points at it', async () => {
    const store = createStore();
    const draftLeadId = 'draft-lead-id';

    seedDraft(store, { id: draftLeadId, __typename: 'Person' }, person);

    const { result } = renderHooks(store, {
      fieldMetadataItem: personOpportunitiesField,
      objectMetadataItem: person,
      relationObjectMetadataNameSingular: 'opportunity',
      relationObjectMetadataItem: opportunity,
      relationFieldMetadataItem: opportunityPointOfContactField,
      recordId: draftLeadId,
    });

    act(() => {
      result.current.addNew.createNewRecordAndOpenSidePanel?.();
    });

    const draftPolicyId = getNewDraftId(store, draftLeadId);
    const draftPolicyMeta = store
      .get(draftRecordIdsState.atom)
      .get(draftPolicyId);

    if (draftPolicyMeta === undefined) {
      throw new Error('Draft meta missing');
    }

    await act(async () => {
      await result.current.persistDraft.persistDraftRecord(
        draftPolicyId,
        draftPolicyMeta,
      );
    });

    expect(createdInputs.map((call) => call.objectNameSingular)).toEqual([
      'person',
      'opportunity',
    ]);
    expect(createdInputs[1].input.pointOfContactId).toBe(draftLeadId);
    expect(store.get(draftRecordIdsState.atom).size).toBe(0);
  });

  it('links a child back onto an unsaved parent draft instead of updating it on the server', async () => {
    const store = createStore();
    const draftOpportunityId = 'draft-opportunity-id';

    seedDraft(
      store,
      { id: draftOpportunityId, __typename: 'Opportunity' },
      opportunity,
    );

    const { result } = renderHooks(store, {
      fieldMetadataItem: opportunityPointOfContactField,
      objectMetadataItem: opportunity,
      relationObjectMetadataNameSingular: 'person',
      relationObjectMetadataItem: person,
      relationFieldMetadataItem: personOpportunitiesField,
      recordId: draftOpportunityId,
    });

    act(() => {
      result.current.addNew.createNewRecordAndOpenSidePanel?.();
    });

    const draftLeadId = getNewDraftId(store, draftOpportunityId);
    const draftLeadMeta = store.get(draftRecordIdsState.atom).get(draftLeadId);

    if (draftLeadMeta === undefined) {
      throw new Error('Draft meta missing');
    }

    await act(async () => {
      await result.current.persistDraft.persistDraftRecord(
        draftLeadId,
        draftLeadMeta,
      );
    });

    expect(createdInputs.map((call) => call.objectNameSingular)).toEqual([
      'person',
    ]);
    expect(mockUpdateOneRecord).not.toHaveBeenCalled();
    expect(
      store.get(recordStoreFamilyState.atomFamily(draftOpportunityId))
        ?.pointOfContactId,
    ).toBe(draftLeadId);
    expect(store.get(draftRecordIdsState.atom).has(draftOpportunityId)).toBe(
      true,
    );
  });
});
