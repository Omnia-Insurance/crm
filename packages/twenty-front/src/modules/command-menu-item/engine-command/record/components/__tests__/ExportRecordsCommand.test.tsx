import { currentWorkspaceState } from '@/auth/states/currentWorkspaceState';
import { ExportRecordsCommand } from '@/command-menu-item/engine-command/record/components/ExportRecordsCommand';
import { CommandComponentInstanceContext } from '@/command-menu-item/engine-command/states/contexts/CommandComponentInstanceContext';
import { render, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';
import { mockCurrentWorkspace } from '~/testing/mock-data/users';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

const mockIndexDownload = jest.fn().mockResolvedValue(undefined);
const mockCompletedIndexDownload = jest.fn();
let mockHasMoreRecords = false;
const mockAsyncDownload = jest.fn().mockResolvedValue(undefined);
const mockCancelAsyncDownload = jest.fn();
const mockSingleRecordDownload = jest.fn().mockResolvedValue(undefined);
const mockObjectMetadataItem = getMockObjectMetadataItemOrThrow('person');
let mockRecordIndexId: string | undefined;

jest.mock(
  '@/command-menu-item/engine-command/hooks/useHeadlessCommandContextApi',
  () => ({
    useHeadlessCommandContextApi: () => ({
      objectMetadataItem: mockObjectMetadataItem,
      recordIndexId: mockRecordIndexId,
      selectedRecords: [{ id: 'selected-record' }],
    }),
  }),
);
jest.mock(
  '@/object-record/record-index/export/hooks/useRecordIndexExportRecords',
  () => ({
    useRecordIndexExportRecords: ({
      onMoreRecords,
      abortSignal,
    }: {
      onMoreRecords?: () => Promise<void>;
      abortSignal?: AbortSignal;
    }) => ({
      download: async () => {
        await mockIndexDownload();
        if (abortSignal?.aborted) {
          return;
        }
        mockCompletedIndexDownload();
        if (mockHasMoreRecords && isDefined(onMoreRecords)) {
          await onMoreRecords();
        }
      },
      progress: {},
    }),
  }),
);
jest.mock(
  '@/object-record/record-index/export/hooks/useRecordIndexAsyncExportRecords',
  () => ({
    useRecordIndexAsyncExportRecords: () => ({
      download: mockAsyncDownload,
      cancel: mockCancelAsyncDownload,
    }),
  }),
);
jest.mock('@/object-record/record-show/hooks/useExportSingleRecord', () => ({
  useExportSingleRecord: () => ({ download: mockSingleRecordDownload }),
}));

const renderExport = ({
  isStrictMode = false,
}: { isStrictMode?: boolean } = {}) => {
  const Wrapper = getJestMetadataAndApolloMocksWrapper({
    apolloMocks: [],
    onInitializeJotaiStore: (store) => {
      store.set(currentWorkspaceState.atom, {
        ...mockCurrentWorkspace,
        featureFlags: [],
      });
    },
  });
  return render(<ExportRecordsCommand />, {
    reactStrictMode: isStrictMode,
    wrapper: ({ children }: { children: ReactNode }) => (
      <Wrapper>
        <CommandComponentInstanceContext.Provider
          value={{ instanceId: 'export-command' }}
        >
          {children}
        </CommandComponentInstanceContext.Provider>
      </Wrapper>
    ),
  });
};

beforeEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
  mockRecordIndexId = 'record-index';
  mockHasMoreRecords = false;
});

// OMNIA-CUSTOM: index exports always run as the server job; the local first-page CSV is never used
it.each([false, true])(
  'exports through the server job whatever the row count, hasMoreRecords=%s',
  async (hasMoreRecords) => {
    mockHasMoreRecords = hasMoreRecords;
    renderExport();
    await waitFor(() => expect(mockAsyncDownload).toHaveBeenCalledTimes(1));
    expect(mockIndexDownload).not.toHaveBeenCalled();
    expect(mockSingleRecordDownload).not.toHaveBeenCalled();
  },
);

// OMNIA-CUSTOM: the server job starts once through StrictMode remounts and is cancelled on unmount
it('keeps index export active through StrictMode remounts', async () => {
  const { unmount } = renderExport({ isStrictMode: true });

  await waitFor(() => expect(mockAsyncDownload).toHaveBeenCalledTimes(1));
  expect(mockIndexDownload).not.toHaveBeenCalled();
  expect(mockCancelAsyncDownload).not.toHaveBeenCalled();

  unmount();

  await waitFor(() => expect(mockCancelAsyncDownload).toHaveBeenCalledTimes(1));
});

it('keeps single-record exports local', async () => {
  mockRecordIndexId = undefined;
  renderExport();
  await waitFor(() =>
    expect(mockSingleRecordDownload).toHaveBeenCalledTimes(1),
  );
  expect(mockAsyncDownload).not.toHaveBeenCalled();
  expect(mockIndexDownload).not.toHaveBeenCalled();
});
