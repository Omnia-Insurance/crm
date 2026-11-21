import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';
import { ToastProvider } from 'twenty-ui/components/feedback';

import { ReconciliationCarrierPickerModal } from '@/reconciliation/components/ReconciliationCarrierPickerModal';
import { useOpenReconciliationWizard } from '@/reconciliation/hooks/useOpenReconciliationWizard';

const mockFindManyRecordsLazy = jest.fn();
const mockOpenReconciliationImportDialog = jest.fn();

jest.mock('@/object-record/hooks/useLazyFindManyRecords', () => ({
  useLazyFindManyRecords: () => ({
    findManyRecordsLazy: mockFindManyRecordsLazy,
  }),
}));

jest.mock('@/reconciliation/hooks/useOpenReconciliationImportDialog', () => ({
  useOpenReconciliationImportDialog: () => ({
    openReconciliationImportDialog: mockOpenReconciliationImportDialog,
  }),
}));

const AMBETTER_CARRIER_CONFIG = {
  id: 'config-ambetter',
  name: 'Ambetter BOB',
  carrier: { id: 'carrier-ambetter', name: 'Ambetter' },
};

const UHO_CARRIER_CONFIG = {
  id: 'config-uho',
  name: 'UHO BOB',
  carrier: { id: 'carrier-uho', name: 'United Health One' },
};

const ReconciliationWizardTrigger = () => {
  const { openReconciliationWizard } = useOpenReconciliationWizard();

  return (
    <button type="button" onClick={() => openReconciliationWizard()}>
      New reconciliation
    </button>
  );
};

const renderCarrierPicker = () => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <JotaiProvider store={createStore()}>
      <ToastProvider>{children}</ToastProvider>
    </JotaiProvider>
  );

  render(
    <>
      <ReconciliationWizardTrigger />
      <ReconciliationCarrierPickerModal />
    </>,
    { wrapper: Wrapper },
  );
};

describe('ReconciliationCarrierPickerModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens the import dialog directly when only one carrier config exists', async () => {
    const user = userEvent.setup();
    mockFindManyRecordsLazy.mockResolvedValue({
      records: [AMBETTER_CARRIER_CONFIG],
      error: undefined,
    });

    renderCarrierPicker();
    await user.click(
      screen.getByRole('button', { name: 'New reconciliation' }),
    );

    await waitFor(() =>
      expect(mockOpenReconciliationImportDialog).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'config-ambetter' }),
      ),
    );
    expect(screen.queryByText('Select carrier')).not.toBeInTheDocument();
  });

  it('runs the import with the carrier config the reviewer picks', async () => {
    const user = userEvent.setup();
    mockFindManyRecordsLazy.mockResolvedValue({
      records: [UHO_CARRIER_CONFIG, AMBETTER_CARRIER_CONFIG],
      error: undefined,
    });

    renderCarrierPicker();
    await user.click(
      screen.getByRole('button', { name: 'New reconciliation' }),
    );

    expect(await screen.findByText('Select carrier')).toBeInTheDocument();
    expect(mockOpenReconciliationImportDialog).not.toHaveBeenCalled();

    await user.click(screen.getByText('Ambetter BOB · Ambetter'));
    await user.click(await screen.findByText(/UHO BOB/));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(mockOpenReconciliationImportDialog).toHaveBeenCalledTimes(1);
    expect(mockOpenReconciliationImportDialog).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'config-uho' }),
    );
  });

  it('explains that a carrier config is needed when none exists', async () => {
    const user = userEvent.setup();
    mockFindManyRecordsLazy.mockResolvedValue({
      records: [],
      error: undefined,
    });

    renderCarrierPicker();
    await user.click(
      screen.getByRole('button', { name: 'New reconciliation' }),
    );

    expect(
      await screen.findByText('No carrier configuration'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(mockOpenReconciliationImportDialog).not.toHaveBeenCalled();
  });

  it('starts a new run after the carrier configs failed to load', async () => {
    const user = userEvent.setup();
    mockFindManyRecordsLazy
      .mockResolvedValueOnce({ records: null, error: new Error('Network') })
      .mockResolvedValueOnce({
        records: [AMBETTER_CARRIER_CONFIG],
        error: undefined,
      });

    renderCarrierPicker();
    await user.click(
      screen.getByRole('button', { name: 'New reconciliation' }),
    );
    await waitFor(() =>
      expect(mockFindManyRecordsLazy).toHaveBeenCalledTimes(1),
    );

    await user.click(
      screen.getByRole('button', { name: 'New reconciliation' }),
    );

    await waitFor(() =>
      expect(mockOpenReconciliationImportDialog).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'config-ambetter' }),
      ),
    );
    expect(mockFindManyRecordsLazy).toHaveBeenCalledTimes(2);
  });
});
