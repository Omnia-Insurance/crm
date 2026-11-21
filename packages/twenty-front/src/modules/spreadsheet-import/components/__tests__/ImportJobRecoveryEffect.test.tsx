import { type MockedResponse } from '@apollo/client/testing';
import { act, render, waitFor } from '@testing-library/react';
import { GraphQLError } from 'graphql';

import { isCookieAuthActiveState } from '@/auth/states/isCookieAuthActiveState';
import { ImportJobRecoveryEffect } from '@/spreadsheet-import/components/ImportJobRecoveryEffect';
import { ACTIVE_IMPORT_JOB_STORAGE_KEY } from '@/spreadsheet-import/constants/ActiveImportJobStorageKey';
import { IMPORT_JOB_POLL_INTERVAL_MS } from '@/spreadsheet-import/constants/ImportJobPollIntervalMs';
import { CANCEL_IMPORT_JOB } from '@/spreadsheet-import/graphql/mutations/cancelImportJob';
import { GET_IMPORT_JOB } from '@/spreadsheet-import/graphql/queries/importJob';
import { activeImportJobState } from '@/spreadsheet-import/states/activeImportJobState';
import { type ImportJobSummary } from '@/spreadsheet-import/types/ImportJobSummary';
import { backgroundJobsState } from '@/ui/feedback/background-job-indicator/states/backgroundJobState';
import { jotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';

const IMPORT_JOB_ID = '0f4b6b1e-5d4a-4a8e-9b0e-2f3c4d5e6f70';

const STORED_ACTIVE_IMPORT_JOB = {
  importJobId: IMPORT_JOB_ID,
  objectNameSingular: 'company',
  totalRecords: 2,
};

const buildImportJob = (
  overrides: Partial<ImportJobSummary>,
): ImportJobSummary & { __typename: 'ImportJob' } => ({
  __typename: 'ImportJob',
  id: IMPORT_JOB_ID,
  objectNameSingular: 'company',
  fileName: null,
  status: 'PROCESSING',
  totalRecords: 2,
  processedRecords: 1,
  successCount: 1,
  warningCount: 0,
  failureCount: 0,
  result: null,
  createdAt: '2026-11-20T00:00:00.000Z',
  ...overrides,
});

const buildGetImportJobMock = (
  result: MockedResponse['result'],
): MockedResponse => ({
  request: { query: GET_IMPORT_JOB, variables: { importJobId: IMPORT_JOB_ID } },
  result,
});

const renderRecoveryEffect = (
  apolloMocks: MockedResponse[],
  { isLogged = true }: { isLogged?: boolean } = {},
) => {
  // Every card ever shown, so a card that appears and is then removed still counts
  const shownImportJobIds = new Set<string>();

  const Wrapper = getJestMetadataAndApolloMocksWrapper({
    apolloMocks,
    onInitializeJotaiStore: (store) => {
      store.set(isCookieAuthActiveState.atom, isLogged);
      store.sub(backgroundJobsState.atom, () => {
        for (const backgroundJob of store.get(backgroundJobsState.atom)) {
          shownImportJobIds.add(backgroundJob.id);
        }
      });
    },
  });

  localStorage.setItem(
    ACTIVE_IMPORT_JOB_STORAGE_KEY,
    JSON.stringify(STORED_ACTIVE_IMPORT_JOB),
  );

  render(<ImportJobRecoveryEffect />, { wrapper: Wrapper });

  return { shownImportJobIds };
};

const getStoredActiveImportJob = () =>
  localStorage.getItem(ACTIVE_IMPORT_JOB_STORAGE_KEY);

const getBackgroundJobs = () => jotaiStore.get(backgroundJobsState.atom);

describe('ImportJobRecoveryEffect', () => {
  afterEach(() => {
    localStorage.clear();
  });

  // The stored job can be another user's (an expired session keeps the page): its card,
  // with the object and row count, must wait for the requester-scoped importJob query
  it('should stop tracking without ever showing a card when the import is not found', async () => {
    const { shownImportJobIds } = renderRecoveryEffect([
      buildGetImportJobMock({ data: { importJob: null } }),
    ]);

    await waitFor(() => expect(getStoredActiveImportJob()).toBeNull());
    expect(jotaiStore.get(activeImportJobState.atom)).toBeNull();
    expect(getBackgroundJobs()).toEqual([]);
    expect([...shownImportJobIds]).toEqual([]);
  });

  it('should treat a not found error as the end of the import', async () => {
    const { shownImportJobIds } = renderRecoveryEffect([
      buildGetImportJobMock({
        errors: [
          new GraphQLError('Import not found.', {
            extensions: { code: 'NOT_FOUND' },
          }),
        ],
      }),
    ]);

    await waitFor(() => expect(getStoredActiveImportJob()).toBeNull());
    expect(jotaiStore.get(activeImportJobState.atom)).toBeNull();
    expect(getBackgroundJobs()).toEqual([]);
    expect([...shownImportJobIds]).toEqual([]);
  });

  it('should keep tracking after a transient error, without a card until the import answers', async () => {
    const getImportJobRequest = jest.fn(() => true);

    const { shownImportJobIds } = renderRecoveryEffect([
      {
        request: { query: GET_IMPORT_JOB, variables: getImportJobRequest },
        error: new Error('Network error'),
        delay: 0,
      },
    ]);

    await waitFor(() => expect(getImportJobRequest).toHaveBeenCalled());
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    expect(getStoredActiveImportJob()).not.toBeNull();
    expect(jotaiStore.get(activeImportJobState.atom)).toEqual(
      STORED_ACTIVE_IMPORT_JOB,
    );
    expect([...shownImportJobIds]).toEqual([]);
  });

  it('should show the final counts and stop tracking once the import completes', async () => {
    renderRecoveryEffect([
      buildGetImportJobMock({
        data: {
          importJob: buildImportJob({
            status: 'COMPLETED',
            processedRecords: 2,
            successCount: 1,
            failureCount: 1,
            result: { errors: [{ error: 'Row 2 is invalid' }] },
          }),
        },
      }),
    ]);

    await waitFor(() => expect(getStoredActiveImportJob()).toBeNull());
    expect(jotaiStore.get(activeImportJobState.atom)).toBeNull();
    expect(getBackgroundJobs()).toEqual([
      expect.objectContaining({
        id: IMPORT_JOB_ID,
        label: 'Importing Companies',
        status: 'completed',
        totalItems: 2,
        processedItems: 2,
        successCount: 1,
        failureCount: 1,
        errorMessages: ['Row 2 is invalid'],
      }),
    ]);
    expect(getBackgroundJobs()[0].onCancel).toBeUndefined();
  });

  it('should show the server phase while running and cancel through cancelImportJob', async () => {
    const cancelImportJobResult = jest.fn(() => ({
      data: {
        cancelImportJob: {
          __typename: 'ImportJob',
          id: IMPORT_JOB_ID,
          status: 'CANCELLED',
        },
      },
    }));

    renderRecoveryEffect([
      buildGetImportJobMock({
        data: {
          importJob: buildImportJob({
            result: { phase: 'Resolving relations...' },
          }),
        },
      }),
      {
        request: {
          query: CANCEL_IMPORT_JOB,
          variables: { importJobId: IMPORT_JOB_ID },
        },
        result: cancelImportJobResult,
      },
    ]);

    await waitFor(() =>
      expect(getBackgroundJobs()[0]?.label).toBe(
        'Companies: Resolving relations...',
      ),
    );
    expect(getStoredActiveImportJob()).not.toBeNull();

    act(() => {
      getBackgroundJobs()[0].onCancel?.();
    });

    await waitFor(() => expect(cancelImportJobResult).toHaveBeenCalled());
  });

  it('should wait for sign-in before picking up the stored import', async () => {
    const getImportJobResult = jest.fn(() => ({
      data: { importJob: buildImportJob({}) },
    }));

    renderRecoveryEffect([buildGetImportJobMock(getImportJobResult)], {
      isLogged: false,
    });

    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    expect(getImportJobResult).not.toHaveBeenCalled();
    expect(getBackgroundJobs()).toEqual([]);
    expect(getStoredActiveImportJob()).not.toBeNull();

    act(() => {
      jotaiStore.set(isCookieAuthActiveState.atom, true);
    });

    await waitFor(() =>
      expect(getBackgroundJobs()).toEqual([
        expect.objectContaining({ id: IMPORT_JOB_ID, status: 'processing' }),
      ]),
    );
    expect(getImportJobResult).toHaveBeenCalledTimes(1);
  });

  it('should stop polling and clear the import cards when the session ends', async () => {
    jest.useFakeTimers();

    try {
      const getImportJobResult = jest.fn(() => ({
        data: { importJob: buildImportJob({}) },
      }));

      renderRecoveryEffect([
        {
          ...buildGetImportJobMock(getImportJobResult),
          delay: 0,
          maxUsageCount: Number.POSITIVE_INFINITY,
        },
      ]);

      await waitFor(() =>
        expect(getBackgroundJobs()).toEqual([
          expect.objectContaining({ id: IMPORT_JOB_ID, status: 'processing' }),
        ]),
      );
      expect(getImportJobResult).toHaveBeenCalledTimes(1);

      act(() => {
        jotaiStore.set(isCookieAuthActiveState.atom, false);
      });

      expect(getBackgroundJobs()).toEqual([]);

      await act(() =>
        jest.advanceTimersByTimeAsync(IMPORT_JOB_POLL_INTERVAL_MS * 2),
      );

      expect(getImportJobResult).toHaveBeenCalledTimes(1);
      // Kept so the same user picks the import up again after signing back in
      expect(getStoredActiveImportJob()).not.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
