import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { useCreateNewRecord } from '@/object-record/hooks/useCreateNewRecord';
import { isSidePanelOpenedState } from '@/side-panel/states/isSidePanelOpenedState';
import { sidePanelNavigationStackState } from '@/side-panel/states/sidePanelNavigationStackState';
import { renderHook } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppPath, SidePanelPages } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { IconList } from 'twenty-ui/icon';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

const mockOpenReconciliationWizard = jest.fn();
const mockRequestRecordCreation = jest.fn();
const mockNavigate = jest.fn();

jest.mock('@/reconciliation/hooks/useOpenReconciliationWizard', () => ({
  useOpenReconciliationWizard: () => ({
    openReconciliationWizard: mockOpenReconciliationWizard,
  }),
}));
jest.mock('@/object-record/record-form/hooks/useRecordCreationForm', () => ({
  useRecordCreationForm: () => ({
    requestRecordCreation: mockRequestRecordCreation,
  }),
}));
jest.mock('@/object-record/hooks/useBuildRecordInputFromRLSPredicates', () => ({
  useBuildRecordInputFromRLSPredicates: () => ({
    buildRecordInputFromRLSPredicates: () => ({
      accountOwnerId: 'current-workspace-member-id',
    }),
  }),
}));
jest.mock('@/object-record/hooks/useCreateOneRecord', () => ({
  useCreateOneRecord: () => ({ createOneRecord: jest.fn() }),
}));
jest.mock('@/side-panel/hooks/useOpenRecordInSidePanel', () => ({
  useOpenRecordInSidePanel: () => ({ openRecordInSidePanel: jest.fn() }),
}));
jest.mock('@/side-panel/hooks/useSidePanelMenu', () => ({
  useSidePanelMenu: () => ({ closeSidePanelMenu: jest.fn() }),
}));
jest.mock('~/hooks/useNavigateApp', () => ({
  useNavigateApp: () => mockNavigate,
}));

const companyMetadata = getMockObjectMetadataItemOrThrow('company');

// The metadata mocks carry no Omnia objects, so a standard one stands in.
const reconciliationMetadata: EnrichedObjectMetadataItem = {
  ...companyMetadata,
  nameSingular: 'reconciliation',
  namePlural: 'reconciliations',
};

type SidePanelSetup = {
  isOpened: boolean;
  routedPathname: string;
};

const renderUseCreateNewRecord = ({
  objectMetadataItem,
  pathname,
  sidePanel,
}: {
  objectMetadataItem: EnrichedObjectMetadataItem;
  pathname: string;
  sidePanel?: SidePanelSetup;
}) => {
  const store = createStore();

  if (isDefined(sidePanel)) {
    store.set(isSidePanelOpenedState.atom, sidePanel.isOpened);
    store.set(sidePanelNavigationStackState.atom, [
      {
        page: SidePanelPages.RoutedPage,
        pageTitle: 'Reconciliations',
        pageIcon: IconList,
        pageId: 'side-panel-routed-page-id',
        routedLocation: {
          pathname: sidePanel.routedPathname,
          search: '',
          hash: '',
          state: null,
          key: 'side-panel-routed-page',
        },
      },
    ]);
  }

  return renderHook(() => useCreateNewRecord({ objectMetadataItem }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <JotaiProvider store={store}>
        <MemoryRouter initialEntries={[pathname]}>{children}</MemoryRouter>
      </JotaiProvider>
    ),
  });
};

const flushPendingPromises = () =>
  new Promise((resolve) => setTimeout(resolve, 0));

const NAVIGATION_TO_RECONCILIATION_INDEX = [
  [AppPath.RecordIndexPage, { objectNamePlural: 'reconciliations' }],
];

beforeEach(() => {
  jest.clearAllMocks();
});

it.each<{
  description: string;
  pathname: string;
  sidePanel?: SidePanelSetup;
  expectedNavigateCalls: unknown[][];
}>([
  {
    description: 'another index',
    pathname: '/objects/people',
    expectedNavigateCalls: NAVIGATION_TO_RECONCILIATION_INDEX,
  },
  {
    description: 'the reconciliation index',
    pathname: '/objects/reconciliations',
    expectedNavigateCalls: [],
  },
  {
    description: 'a reconciliation index open in the side panel',
    pathname: '/objects/people',
    sidePanel: { isOpened: true, routedPathname: '/objects/reconciliations' },
    expectedNavigateCalls: [],
  },
  {
    description:
      'a closed side panel that still holds the reconciliation index',
    pathname: '/objects/people',
    sidePanel: { isOpened: false, routedPathname: '/objects/reconciliations' },
    expectedNavigateCalls: NAVIGATION_TO_RECONCILIATION_INDEX,
  },
  {
    description: 'a reconciliation record open in the side panel',
    pathname: '/objects/people',
    sidePanel: {
      isOpened: true,
      routedPathname: '/object/reconciliation/reconciliation-id',
    },
    expectedNavigateCalls: NAVIGATION_TO_RECONCILIATION_INDEX,
  },
])(
  'awaits the reconciliation wizard instead of the creation form from $description',
  async ({ pathname, sidePanel, expectedNavigateCalls }) => {
    let finishWizard: () => void = () => {};

    mockOpenReconciliationWizard.mockReturnValue(
      new Promise<void>((resolve) => {
        finishWizard = () => resolve();
      }),
    );

    const { result } = renderUseCreateNewRecord({
      objectMetadataItem: reconciliationMetadata,
      pathname,
      sidePanel,
    });

    let isCreationSettled = false;

    const creation = result.current
      .createNewRecord({ position: 'first' })
      .finally(() => {
        isCreationSettled = true;
      });

    await flushPendingPromises();

    expect(isCreationSettled).toBe(false);

    finishWizard();

    await expect(creation).resolves.toBeUndefined();
    expect(mockOpenReconciliationWizard).toHaveBeenCalledTimes(1);
    expect(mockRequestRecordCreation).not.toHaveBeenCalled();
    expect(mockNavigate.mock.calls).toEqual(expectedNavigateCalls);
  },
);

it('requests the creation form seeded with the RLS values for other objects', async () => {
  mockRequestRecordCreation.mockResolvedValue(null);

  const { result } = renderUseCreateNewRecord({
    objectMetadataItem: companyMetadata,
    pathname: '/objects/companies',
  });

  await expect(
    result.current.createNewRecord({ position: 'first' }),
  ).resolves.toBeUndefined();

  expect(mockOpenReconciliationWizard).not.toHaveBeenCalled();
  expect(mockRequestRecordCreation).toHaveBeenCalledTimes(1);
  expect(mockRequestRecordCreation).toHaveBeenCalledWith(
    expect.objectContaining({
      objectMetadataItem: companyMetadata,
      initialDraftRecord: {
        accountOwnerId: 'current-workspace-member-id',
        position: 'first',
      },
    }),
  );
});
