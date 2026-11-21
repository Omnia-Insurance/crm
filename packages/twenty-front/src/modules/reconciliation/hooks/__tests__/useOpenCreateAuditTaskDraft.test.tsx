import { act, renderHook, waitFor } from '@testing-library/react';
import { StandardObjectNameSingular } from 'twenty-shared/types';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type RecordCreationRequest } from '@/object-record/record-form/types/RecordCreationRequest';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { useOpenCreateAuditTaskDraft } from '@/reconciliation/hooks/useOpenCreateAuditTaskDraft';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';

const mockCreateOneTask = jest.fn();
const mockCreateOneTaskTarget = jest.fn();
const mockUpdateOneRecord = jest.fn();
const mockRequestRecordCreation = jest.fn();
const mockOpenRecordInSidePanel = jest.fn();

jest.mock('@/object-record/hooks/useCreateOneRecord', () => ({
  useCreateOneRecord: ({
    objectNameSingular,
  }: {
    objectNameSingular: string;
  }) => ({
    createOneRecord:
      objectNameSingular === 'task'
        ? mockCreateOneTask
        : mockCreateOneTaskTarget,
  }),
}));

jest.mock('@/object-record/hooks/useUpdateOneRecord', () => ({
  useUpdateOneRecord: () => ({ updateOneRecord: mockUpdateOneRecord }),
}));

jest.mock('@/object-record/hooks/useBuildRecordInputFromRLSPredicates', () => ({
  useBuildRecordInputFromRLSPredicates: () => ({
    buildRecordInputFromRLSPredicates: () => ({
      assigneeId: 'current-workspace-member-id',
    }),
  }),
}));

jest.mock('@/object-record/record-form/hooks/useRecordCreationForm', () => ({
  useRecordCreationForm: () => ({
    requestRecordCreation: mockRequestRecordCreation,
  }),
}));

jest.mock('@/side-panel/hooks/useOpenRecordInSidePanel', () => ({
  useOpenRecordInSidePanel: () => ({
    openRecordInSidePanel: mockOpenRecordInSidePanel,
  }),
}));

const REVIEW_ITEM_ID = 'review-item-id';
const CREATED_TASK_ID = 'created-task-id';

// The metadata mocks carry no Omnia objects, so an existing task target object stands in for reviewItem.
const objectMetadataItemsWithReviewItem: EnrichedObjectMetadataItem[] =
  getTestEnrichedObjectMetadataItemsMock().map((objectMetadataItem) =>
    objectMetadataItem.nameSingular === 'rocket'
      ? {
          ...objectMetadataItem,
          nameSingular: 'reviewItem',
          namePlural: 'reviewItems',
        }
      : objectMetadataItem,
  );

const renderUseOpenCreateAuditTaskDraft = ({
  objectMetadataItems = objectMetadataItemsWithReviewItem,
  onTaskCreated,
}: {
  objectMetadataItems?: EnrichedObjectMetadataItem[];
  onTaskCreated?: () => Promise<void>;
} = {}) =>
  renderHook(() => useOpenCreateAuditTaskDraft({ onTaskCreated }), {
    wrapper: getJestMetadataAndApolloMocksWrapper({
      apolloMocks: [],
      objectMetadataItems,
    }),
  });

const openCreationForm = (
  result: ReturnType<typeof renderUseOpenCreateAuditTaskDraft>['result'],
) => {
  let settleCreationForm: (
    createdRecord: ObjectRecord | null,
  ) => void = () => {};

  mockRequestRecordCreation.mockImplementation(
    () =>
      new Promise<ObjectRecord | null>((resolve) => {
        settleCreationForm = resolve;
      }),
  );

  act(() => {
    result.current.openCreateAuditTaskDraft({ reviewItemId: REVIEW_ITEM_ID });
  });

  const [request] = mockRequestRecordCreation.mock.calls[0] as [
    RecordCreationRequest,
  ];

  return {
    request,
    settle: async (createdRecord: ObjectRecord | null) => {
      await act(async () => {
        settleCreationForm(createdRecord);
      });
    },
  };
};

describe('useOpenCreateAuditTaskDraft', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateOneTask.mockImplementation(
      async (recordInput: Partial<ObjectRecord>) => ({
        ...recordInput,
        id: CREATED_TASK_ID,
        __typename: 'Task',
      }),
    );
    mockCreateOneTaskTarget.mockResolvedValue({ id: 'task-target-id' });
    mockUpdateOneRecord.mockResolvedValue(undefined);
  });

  it('opens the task creation form without saving anything', () => {
    const { result } = renderUseOpenCreateAuditTaskDraft();

    const { request } = openCreationForm(result);

    expect(request.objectMetadataItem.nameSingular).toBe(
      StandardObjectNameSingular.Task,
    );
    expect(request.canCreateAnother).toBe(false);
    expect(request.initialDraftRecord).toEqual({
      assigneeId: 'current-workspace-member-id',
    });
    expect(mockCreateOneTask).not.toHaveBeenCalled();
    expect(mockCreateOneTaskTarget).not.toHaveBeenCalled();
  });

  it('retries a failed review item link without creating a second task', async () => {
    const onTaskCreated = jest.fn().mockResolvedValue(undefined);
    const linkError = new Error('Link failed');
    mockCreateOneTaskTarget.mockRejectedValueOnce(linkError);

    const { result } = renderUseOpenCreateAuditTaskDraft({ onTaskCreated });
    const { request, settle } = openCreationForm(result);

    await expect(request.createRecord({ title: 'Check premium' })).rejects.toBe(
      linkError,
    );
    const createdTask = await request.createRecord({ title: 'Check premium' });
    await settle(createdTask);

    await waitFor(() => expect(onTaskCreated).toHaveBeenCalledTimes(1));
    expect(mockCreateOneTask).toHaveBeenCalledTimes(1);
    expect(mockUpdateOneRecord).not.toHaveBeenCalled();
    expect(mockCreateOneTaskTarget).toHaveBeenCalledTimes(2);
    expect(mockCreateOneTaskTarget).toHaveBeenLastCalledWith(
      expect.objectContaining({
        taskId: CREATED_TASK_ID,
        targetReviewItemId: REVIEW_ITEM_ID,
      }),
    );
    expect(mockOpenRecordInSidePanel).toHaveBeenCalledWith({
      recordId: CREATED_TASK_ID,
      objectNameSingular: StandardObjectNameSingular.Task,
    });
  });

  it('updates the saved task when the draft changes before the retry', async () => {
    mockCreateOneTaskTarget.mockRejectedValueOnce(new Error('Link failed'));

    const { result } = renderUseOpenCreateAuditTaskDraft();
    const { request } = openCreationForm(result);

    await expect(
      request.createRecord({ title: 'Check premium' }),
    ).rejects.toThrow('Link failed');
    await request.createRecord({ title: 'Check premium and agent' });

    expect(mockCreateOneTask).toHaveBeenCalledTimes(1);
    expect(mockUpdateOneRecord).toHaveBeenCalledWith({
      objectNameSingular: StandardObjectNameSingular.Task,
      idToUpdate: CREATED_TASK_ID,
      updateOneRecordInput: { title: 'Check premium and agent' },
    });
    expect(mockCreateOneTaskTarget).toHaveBeenCalledTimes(2);
  });

  it('neither flags the review item nor opens a task when the form is cancelled', async () => {
    const onTaskCreated = jest.fn().mockResolvedValue(undefined);

    const { result } = renderUseOpenCreateAuditTaskDraft({ onTaskCreated });
    const { settle } = openCreationForm(result);

    await settle(null);

    expect(onTaskCreated).not.toHaveBeenCalled();
    expect(mockOpenRecordInSidePanel).not.toHaveBeenCalled();
  });

  it('does not open the creation form when tasks cannot target review items', () => {
    const { result } = renderUseOpenCreateAuditTaskDraft({
      objectMetadataItems: getTestEnrichedObjectMetadataItemsMock(),
    });

    act(() => {
      result.current.openCreateAuditTaskDraft({ reviewItemId: REVIEW_ITEM_ID });
    });

    expect(mockRequestRecordCreation).not.toHaveBeenCalled();
  });
});
