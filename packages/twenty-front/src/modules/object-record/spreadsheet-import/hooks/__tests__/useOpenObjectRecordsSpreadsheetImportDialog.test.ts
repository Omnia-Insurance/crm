import { type MockedResponse } from '@apollo/client/testing';
import { renderHook } from '@testing-library/react';
import { act } from 'react';

import { StandardObjectNameSingular } from 'twenty-shared/types';
import { useOpenObjectRecordsSpreadsheetImportDialog } from '@/object-record/spreadsheet-import/hooks/useOpenObjectRecordsSpreadsheetImportDialog';
import { APPEND_IMPORT_JOB_ROWS } from '@/spreadsheet-import/graphql/mutations/appendImportJobRows';
import { CANCEL_IMPORT_JOB } from '@/spreadsheet-import/graphql/mutations/cancelImportJob';
import { CREATE_IMPORT_JOB } from '@/spreadsheet-import/graphql/mutations/createImportJob';
import { FINALIZE_IMPORT_JOB } from '@/spreadsheet-import/graphql/mutations/finalizeImportJob';
import { START_IMPORT_JOB } from '@/spreadsheet-import/graphql/mutations/startImportJob';
import { spreadsheetImportDialogState } from '@/spreadsheet-import/states/spreadsheetImportDialogState';
import {
  type ImportedStructuredRow,
  type SpreadsheetImportImportValidationResult,
} from '@/spreadsheet-import/types';
import { jotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';

// OMNIA-CUSTOM: the dialog submits rows to the server import job instead of creating records in the browser

const IMPORT_JOB_ID = '8f9c2a61-4d3b-4e7f-9a12-5b6c7d8e9f01';
const ACCOUNT_OWNER_ID = '2a4b6c8d-0e1f-4a2b-8c3d-4e5f6a7b8c9d';

const mockStartTracking = jest.fn();

jest.mock('@/spreadsheet-import/hooks/useImportJobProgress', () => ({
  useImportJobProgress: () => ({ startTracking: mockStartTracking }),
}));

const mockEnqueueToast = jest.fn();

jest.mock('twenty-ui/components/feedback', () => ({
  ...jest.requireActual('twenty-ui/components/feedback'),
  useToast: () => ({
    enqueueToast: mockEnqueueToast,
    closeToast: jest.fn(),
    updateToast: jest.fn(),
  }),
}));

type MutationVariables = Record<string, unknown>;

const buildImportJob = (totalRecords: number) => ({
  __typename: 'ImportJob',
  id: IMPORT_JOB_ID,
  objectNameSingular: StandardObjectNameSingular.Company,
  fileName: null,
  status: 'PENDING',
  totalRecords,
  processedRecords: 0,
  createdAt: '2026-11-20T00:00:00.000Z',
});

const buildValidationResult = (
  validStructuredRows: ImportedStructuredRow[],
): SpreadsheetImportImportValidationResult => ({
  validStructuredRows,
  invalidStructuredRows: [],
  allStructuredRows: validStructuredRows.map((row, index) => ({
    ...row,
    __index: `row-${index}`,
  })),
});

const buildCompanyRows = (count: number): ImportedStructuredRow[] =>
  Array.from({ length: count }, (_, index) => ({
    name: `Example Company ${index}`,
  }));

const fakeCsv = () => {
  const csvContent = 'name\nExample Company';
  const blob = new Blob([csvContent], { type: 'text/csv' });
  return new File([blob], 'fakeData.csv', { type: 'text/csv' });
};

const renderImportDialogHook = (apolloMocks: MockedResponse[]) =>
  renderHook(
    () =>
      useOpenObjectRecordsSpreadsheetImportDialog(
        StandardObjectNameSingular.Company,
      ),
    { wrapper: getJestMetadataAndApolloMocksWrapper({ apolloMocks }) },
  );

const openDialogAndGetOnSubmit = async (
  result: ReturnType<typeof renderImportDialogHook>['result'],
) => {
  await act(async () => {
    result.current.openObjectRecordsSpreadsheetImportDialog();
  });

  const onSubmit = jotaiStore.get(spreadsheetImportDialogState.atom).options
    ?.onSubmit;

  if (onSubmit === undefined) {
    throw new Error('The import dialog was not opened with an onSubmit');
  }

  return onSubmit;
};

// What the dialog's Cancel button (and its close after a successful submit) calls
const clickDialogCancel = () =>
  jotaiStore.get(spreadsheetImportDialogState.atom).options?.onAbortSubmit?.();

const buildCreateImportJobMock = (
  result: MockedResponse['result'] = {
    data: {
      createImportJob: {
        __typename: 'ImportJob',
        id: IMPORT_JOB_ID,
        status: 'UPLOADING',
        totalRecords: 0,
      },
    },
  },
): MockedResponse => ({
  request: { query: CREATE_IMPORT_JOB, variables: () => true },
  result,
});

const buildAppendImportJobRowsMock = (
  result: MockedResponse['result'] = {
    data: {
      appendImportJobRows: {
        __typename: 'AppendRowsResult',
        importJobId: IMPORT_JOB_ID,
        totalRecords: 0,
      },
    },
  },
): MockedResponse => ({
  request: { query: APPEND_IMPORT_JOB_ROWS, variables: () => true },
  result,
  maxUsageCount: Number.POSITIVE_INFINITY,
});

const buildFinalizeImportJobMock = (
  response: Pick<MockedResponse, 'result' | 'error'>,
  variables: (variables: MutationVariables) => boolean = () => true,
): MockedResponse => ({
  request: { query: FINALIZE_IMPORT_JOB, variables },
  ...response,
});

const buildFinalizedImportJob = (totalRecords: number) => ({
  data: {
    finalizeImportJob: {
      __typename: 'ImportJob',
      id: IMPORT_JOB_ID,
      status: 'PENDING',
      totalRecords,
    },
  },
});

const buildCancelImportJobMock = (
  response: Pick<MockedResponse, 'result' | 'error'>,
): MockedResponse => ({
  request: { query: CANCEL_IMPORT_JOB, variables: () => true },
  ...response,
});

const buildCancelledImportJob = () => ({
  data: {
    cancelImportJob: {
      __typename: 'ImportJob',
      id: IMPORT_JOB_ID,
      status: 'CANCELLED',
    },
  },
});

describe('useOpenObjectRecordsSpreadsheetImportDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should open dialog and configure onSubmit function correctly', async () => {
    const { result } = renderImportDialogHook([]);

    const spreadsheetImportDialog = jotaiStore.get(
      spreadsheetImportDialogState.atom,
    );

    expect(spreadsheetImportDialog.isOpen).toBe(false);
    expect(spreadsheetImportDialog.options).toBeNull();

    await act(async () => {
      result.current.openObjectRecordsSpreadsheetImportDialog();
    });

    const dialogAfterOpen = jotaiStore.get(spreadsheetImportDialogState.atom);

    expect(dialogAfterOpen.isOpen).toBe(true);
    expect(dialogAfterOpen.options).toHaveProperty('onSubmit');
    expect(dialogAfterOpen.options?.onSubmit).toBeInstanceOf(Function);
    expect(dialogAfterOpen.options).toHaveProperty('spreadsheetImportFields');
    expect(
      Array.isArray(dialogAfterOpen.options?.spreadsheetImportFields),
    ).toBe(true);
  });

  it('should start an import job in one call for a small import', async () => {
    const startImportJobResult = jest.fn((_variables: MutationVariables) => ({
      data: { startImportJob: buildImportJob(1) },
    }));

    const { result } = renderImportDialogHook([
      {
        request: { query: START_IMPORT_JOB, variables: () => true },
        result: startImportJobResult,
      },
    ]);

    const onSubmit = await openDialogAndGetOnSubmit(result);

    await act(async () => {
      await onSubmit(
        buildValidationResult([
          {
            name: 'Example Company',
            employees: '0',
            idealCustomerProfile: true,
            'id (accountOwner)': ACCOUNT_OWNER_ID,
          },
        ]),
        fakeCsv(),
      );
    });

    expect(startImportJobResult).toHaveBeenCalledTimes(1);

    const variables = startImportJobResult.mock.calls[0][0];

    expect(variables).toMatchObject({
      objectNameSingular: StandardObjectNameSingular.Company,
      columnMappings: {
        columns: expect.arrayContaining([
          expect.objectContaining({
            key: 'id (accountOwner)',
            isRelationConnectField: true,
          }),
        ]),
        relationBehaviors: expect.arrayContaining([
          {
            relationFieldName: 'accountOwner',
            behavior: 'LOOKUP_ASSIGN',
            onNotFound: 'ERROR',
          },
        ]),
      },
    });

    // The connect object is replaced by the dot-notation key the server resolves by id
    expect(variables.validatedRows).toEqual([
      {
        name: 'Example Company',
        employees: 0,
        idealCustomerProfile: true,
        'accountOwner.id': ACCOUNT_OWNER_ID,
      },
    ]);

    expect(mockStartTracking).toHaveBeenCalledWith({
      importJobId: IMPORT_JOB_ID,
      objectNameSingular: StandardObjectNameSingular.Company,
      totalRecords: 1,
    });
    expect(mockEnqueueToast).not.toHaveBeenCalled();
  });

  it('should upload a large import in chunks, then finalize it', async () => {
    const rows = buildCompanyRows(401);

    const createImportJobResult = jest.fn((_variables: MutationVariables) => ({
      data: {
        createImportJob: {
          __typename: 'ImportJob',
          id: IMPORT_JOB_ID,
          status: 'UPLOADING',
          totalRecords: 0,
        },
      },
    }));
    const appendImportJobRowsResult = jest.fn(
      (_variables: MutationVariables) => ({
        data: {
          appendImportJobRows: {
            __typename: 'AppendRowsResult',
            importJobId: IMPORT_JOB_ID,
            totalRecords: 0,
          },
        },
      }),
    );
    const finalizeImportJobResult = jest.fn(
      (_variables: MutationVariables) => ({
        data: {
          finalizeImportJob: {
            __typename: 'ImportJob',
            id: IMPORT_JOB_ID,
            status: 'PENDING',
            totalRecords: rows.length,
          },
        },
      }),
    );
    const startImportJobResult = jest.fn(() => ({
      data: { startImportJob: buildImportJob(rows.length) },
    }));

    const { result } = renderImportDialogHook([
      {
        request: { query: CREATE_IMPORT_JOB, variables: () => true },
        result: createImportJobResult,
      },
      {
        request: { query: APPEND_IMPORT_JOB_ROWS, variables: () => true },
        result: appendImportJobRowsResult,
        maxUsageCount: Number.POSITIVE_INFINITY,
      },
      {
        request: { query: FINALIZE_IMPORT_JOB, variables: () => true },
        result: finalizeImportJobResult,
      },
      {
        request: { query: START_IMPORT_JOB, variables: () => true },
        result: startImportJobResult,
      },
    ]);

    const onSubmit = await openDialogAndGetOnSubmit(result);

    await act(async () => {
      await onSubmit(buildValidationResult(rows), fakeCsv());
    });

    expect(startImportJobResult).not.toHaveBeenCalled();

    expect(createImportJobResult).toHaveBeenCalledTimes(1);
    expect(createImportJobResult.mock.calls[0][0]).toMatchObject({
      objectNameSingular: StandardObjectNameSingular.Company,
      columnMappings: { columns: expect.any(Array) },
    });
    expect(createImportJobResult.mock.calls[0][0]).not.toHaveProperty(
      'validatedRows',
    );

    const appendedChunks = appendImportJobRowsResult.mock.calls.map(
      ([variables]) => variables,
    );

    expect(appendedChunks).toHaveLength(3);
    expect(
      appendedChunks.every(
        (variables) => variables.importJobId === IMPORT_JOB_ID,
      ),
    ).toBe(true);
    // The chunks are uploaded in parallel, so they can arrive in any order
    expect(
      appendedChunks
        .map((variables) => (variables.rows as unknown[]).length)
        .sort((lengthA, lengthB) => lengthA - lengthB),
    ).toEqual([1, 200, 200]);
    expect(
      appendedChunks
        .flatMap((variables) =>
          (variables.rows as { name: string }[]).map(({ name }) => name),
        )
        .sort(),
    ).toEqual(rows.map(({ name }) => name).sort());

    expect(finalizeImportJobResult).toHaveBeenCalledTimes(1);
    expect(finalizeImportJobResult.mock.calls[0][0]).toEqual({
      importJobId: IMPORT_JOB_ID,
    });

    expect(mockStartTracking).toHaveBeenCalledWith({
      importJobId: IMPORT_JOB_ID,
      objectNameSingular: StandardObjectNameSingular.Company,
      totalRecords: rows.length,
    });
  });

  it('should show a toast and re-throw when the import job cannot be started', async () => {
    const { result } = renderImportDialogHook([
      {
        request: { query: START_IMPORT_JOB, variables: () => true },
        error: new Error('Network failure'),
      },
    ]);

    const onSubmit = await openDialogAndGetOnSubmit(result);

    await act(async () => {
      await expect(
        onSubmit(buildValidationResult(buildCompanyRows(1)), fakeCsv()),
      ).rejects.toThrow('Network failure');
    });

    expect(mockEnqueueToast).toHaveBeenCalledTimes(1);
    expect(mockEnqueueToast).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        children: 'Network failure',
      }),
    );
    expect(mockStartTracking).not.toHaveBeenCalled();
  });

  it('should cancel the import job and never finalize it when the dialog is cancelled during the upload', async () => {
    const appendImportJobRowsResult = jest.fn(
      (_variables: MutationVariables) => {
        // The user clicks Cancel while the first upload round is in flight
        clickDialogCancel();

        return {
          data: {
            appendImportJobRows: {
              __typename: 'AppendRowsResult',
              importJobId: IMPORT_JOB_ID,
              totalRecords: 0,
            },
          },
        };
      },
    );
    const finalizeImportJobResult = jest.fn(() => buildFinalizedImportJob(0));
    const cancelImportJobResult = jest.fn((_variables: MutationVariables) =>
      buildCancelledImportJob(),
    );

    const { result } = renderImportDialogHook([
      buildCreateImportJobMock(),
      buildAppendImportJobRowsMock(appendImportJobRowsResult),
      buildFinalizeImportJobMock({ result: finalizeImportJobResult }),
      buildCancelImportJobMock({ result: cancelImportJobResult }),
    ]);

    const onSubmit = await openDialogAndGetOnSubmit(result);

    await act(async () => {
      await onSubmit(buildValidationResult(buildCompanyRows(601)), fakeCsv());
    });

    // 601 rows are 4 chunks uploaded 3 at a time, so the second round never starts
    expect(appendImportJobRowsResult).toHaveBeenCalledTimes(3);
    expect(finalizeImportJobResult).not.toHaveBeenCalled();
    expect(cancelImportJobResult).toHaveBeenCalledTimes(1);
    expect(cancelImportJobResult.mock.calls[0][0]).toEqual({
      importJobId: IMPORT_JOB_ID,
    });
    expect(mockStartTracking).not.toHaveBeenCalled();
    expect(mockEnqueueToast).not.toHaveBeenCalled();
  });

  it('should cancel a small import that was queued while the dialog was cancelled', async () => {
    const startImportJobResult = jest.fn(() => {
      clickDialogCancel();

      return { data: { startImportJob: buildImportJob(1) } };
    });
    const cancelImportJobResult = jest.fn((_variables: MutationVariables) =>
      buildCancelledImportJob(),
    );

    const { result } = renderImportDialogHook([
      {
        request: { query: START_IMPORT_JOB, variables: () => true },
        result: startImportJobResult,
      },
      buildCancelImportJobMock({ result: cancelImportJobResult }),
    ]);

    const onSubmit = await openDialogAndGetOnSubmit(result);

    await act(async () => {
      await onSubmit(buildValidationResult(buildCompanyRows(1)), fakeCsv());
    });

    expect(cancelImportJobResult).toHaveBeenCalledTimes(1);
    expect(cancelImportJobResult.mock.calls[0][0]).toEqual({
      importJobId: IMPORT_JOB_ID,
    });
    expect(mockStartTracking).not.toHaveBeenCalled();
  });

  it('should keep tracking a queued import whose cancel fails, since it still runs', async () => {
    const { result } = renderImportDialogHook([
      {
        request: { query: START_IMPORT_JOB, variables: () => true },
        result: () => {
          clickDialogCancel();

          return { data: { startImportJob: buildImportJob(1) } };
        },
      },
      buildCancelImportJobMock({ error: new Error('Network failure') }),
    ]);

    const onSubmit = await openDialogAndGetOnSubmit(result);

    await act(async () => {
      await onSubmit(buildValidationResult(buildCompanyRows(1)), fakeCsv());
    });

    expect(mockEnqueueToast).toHaveBeenCalledTimes(1);
    expect(mockStartTracking).toHaveBeenCalledWith({
      importJobId: IMPORT_JOB_ID,
      objectNameSingular: StandardObjectNameSingular.Company,
      totalRecords: 1,
    });
  });

  it('should not cancel the import when the dialog closes after a successful submit', async () => {
    const cancelImportJobResult = jest.fn(() => buildCancelledImportJob());

    const { result } = renderImportDialogHook([
      {
        request: { query: START_IMPORT_JOB, variables: () => true },
        result: { data: { startImportJob: buildImportJob(1) } },
      },
      buildCancelImportJobMock({ result: cancelImportJobResult }),
    ]);

    const onSubmit = await openDialogAndGetOnSubmit(result);

    await act(async () => {
      await onSubmit(buildValidationResult(buildCompanyRows(1)), fakeCsv());
      clickDialogCancel();
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(mockStartTracking).toHaveBeenCalledTimes(1);
    expect(cancelImportJobResult).not.toHaveBeenCalled();
  });

  it('should retry finalize on the same job when its first response is lost', async () => {
    const rows = buildCompanyRows(201);
    const createImportJobResult = jest.fn(() => ({
      data: {
        createImportJob: {
          __typename: 'ImportJob',
          id: IMPORT_JOB_ID,
          status: 'UPLOADING',
          totalRecords: 0,
        },
      },
    }));
    const finalizeImportJobRequest = jest.fn(
      (variables: MutationVariables) => variables.importJobId === IMPORT_JOB_ID,
    );
    const cancelImportJobResult = jest.fn(() => buildCancelledImportJob());

    const { result } = renderImportDialogHook([
      buildCreateImportJobMock(createImportJobResult),
      buildAppendImportJobRowsMock(),
      buildFinalizeImportJobMock(
        { error: new Error('Network failure') },
        finalizeImportJobRequest,
      ),
      buildFinalizeImportJobMock(
        { result: buildFinalizedImportJob(rows.length) },
        finalizeImportJobRequest,
      ),
      buildCancelImportJobMock({ result: cancelImportJobResult }),
    ]);

    const onSubmit = await openDialogAndGetOnSubmit(result);

    await act(async () => {
      await onSubmit(buildValidationResult(rows), fakeCsv());
    });

    expect(createImportJobResult).toHaveBeenCalledTimes(1);
    expect(finalizeImportJobRequest).toHaveBeenCalledTimes(2);
    expect(cancelImportJobResult).not.toHaveBeenCalled();
    expect(mockEnqueueToast).not.toHaveBeenCalled();
    expect(mockStartTracking).toHaveBeenCalledWith({
      importJobId: IMPORT_JOB_ID,
      objectNameSingular: StandardObjectNameSingular.Company,
      totalRecords: rows.length,
    });
  });

  it('should cancel the job and re-throw when finalize keeps failing', async () => {
    const cancelImportJobResult = jest.fn((_variables: MutationVariables) =>
      buildCancelledImportJob(),
    );

    const { result } = renderImportDialogHook([
      buildCreateImportJobMock(),
      buildAppendImportJobRowsMock(),
      buildFinalizeImportJobMock({ error: new Error('Network failure') }),
      buildFinalizeImportJobMock({ error: new Error('Network failure') }),
      buildCancelImportJobMock({ result: cancelImportJobResult }),
    ]);

    const onSubmit = await openDialogAndGetOnSubmit(result);

    await act(async () => {
      await expect(
        onSubmit(buildValidationResult(buildCompanyRows(201)), fakeCsv()),
      ).rejects.toThrow('Network failure');
    });

    expect(cancelImportJobResult).toHaveBeenCalledTimes(1);
    expect(cancelImportJobResult.mock.calls[0][0]).toEqual({
      importJobId: IMPORT_JOB_ID,
    });
    expect(mockEnqueueToast).toHaveBeenCalledTimes(1);
    expect(mockStartTracking).not.toHaveBeenCalled();
  });
});
