import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BackgroundJobIndicator } from '@/ui/feedback/background-job-indicator/components/BackgroundJobIndicator';
import {
  backgroundJobsState,
  type BackgroundJobData,
} from '@/ui/feedback/background-job-indicator/states/backgroundJobState';
import { jotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';

const buildJob = (
  overrides: Partial<BackgroundJobData>,
): BackgroundJobData => ({
  id: 'import-job-1',
  label: 'Importing Companies',
  status: 'processing',
  totalItems: 4,
  processedItems: 1,
  successCount: 1,
  warningCount: 0,
  failureCount: 0,
  ...overrides,
});

const renderIndicator = (jobs: BackgroundJobData[]) =>
  render(
    <I18nProvider i18n={i18n}>
      <BackgroundJobIndicator />
    </I18nProvider>,
    {
      wrapper: getJestMetadataAndApolloMocksWrapper({
        onInitializeJotaiStore: (store) => {
          store.set(backgroundJobsState.atom, jobs);
        },
      }),
    },
  );

describe('BackgroundJobIndicator', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('should render nothing without jobs', () => {
    const { container } = renderIndicator([]);

    expect(container).toBeEmptyDOMElement();
  });

  it('should show progress for a running job without a dismiss button', () => {
    renderIndicator([buildJob({ warningCount: 1 })]);

    expect(screen.getByText('Importing Companies')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Importing Companies' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1 of 4 (25%) · 1 warning')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Dismiss' }),
    ).not.toBeInTheDocument();
  });

  it('should let a running job be cancelled', async () => {
    const onCancel = jest.fn();

    renderIndicator([buildJob({ onCancel })]);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: 'Dismiss' }),
    ).not.toBeInTheDocument();
  });

  it('should only offer dismiss once a job has finished', () => {
    renderIndicator([buildJob({ status: 'cancelled', onCancel: jest.fn() })]);

    expect(
      screen.getByText('Importing Companies — cancelled'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Cancel' }),
    ).not.toBeInTheDocument();
  });

  it('should auto-dismiss a completed job', () => {
    jest.useFakeTimers();

    renderIndicator([
      buildJob({ status: 'completed', processedItems: 4, warningCount: 2 }),
    ]);

    expect(
      screen.getByText('Importing Companies — done with 2 warnings'),
    ).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(jotaiStore.get(backgroundJobsState.atom)).toEqual([]);
    expect(
      screen.queryByText('Importing Companies — done with 2 warnings'),
    ).not.toBeInTheDocument();
  });

  it('should keep a failed job with its errors until dismissed', async () => {
    renderIndicator([
      buildJob({
        status: 'failed',
        failureCount: 1,
        errorMessages: ['Row 1', 'Row 2', 'Row 3', 'Row 4', 'Row 5'],
      }),
    ]);

    expect(
      screen.getByText('Importing Companies — failed'),
    ).toBeInTheDocument();
    expect(screen.getByText('1 failure')).toBeInTheDocument();
    expect(screen.getByText('Row 3')).toBeInTheDocument();
    expect(screen.queryByText('Row 4')).not.toBeInTheDocument();
    expect(screen.getByText('...and 2 more')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(jotaiStore.get(backgroundJobsState.atom)).toEqual([]);
  });
});
