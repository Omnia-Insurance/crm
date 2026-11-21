import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider as JotaiProvider } from 'jotai';

import { type RecordField } from '@/object-record/record-field/types/RecordField';
import { AggregateOperations } from '@/object-record/record-table/constants/AggregateOperations';
import { RecordTableContextProvider } from '@/object-record/record-table/contexts/RecordTableContext';
import { RecordTableColumnAggregateFooterCellContext } from '@/object-record/record-table/record-table-footer/components/RecordTableColumnAggregateFooterCellContext';
import { RecordTableColumnFooterWithDropdown } from '@/object-record/record-table/record-table-footer/components/RecordTableColumnAggregateFooterWithDropdown';
import { ScrollWrapperComponentInstanceContext } from '@/ui/utilities/scroll/states/contexts/ScrollWrapperComponentInstanceContext';
import { ViewComponentInstanceContext } from '@/views/states/contexts/ViewComponentInstanceContext';
import { type ViewField } from '@/views/types/ViewField';
import { getMockFieldMetadataItemOrThrow } from '~/testing/utils/getMockFieldMetadataItemOrThrow';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';

const mockPerformViewFieldApiUpdate = jest.fn();

let mockViewFields: ViewField[] = [];

jest.mock(
  '@/object-record/record-table/record-table-footer/hooks/useAggregateRecordsForRecordTableColumnFooter',
  () => ({
    useAggregateRecordsForRecordTableColumnFooter: () => ({
      aggregateValue: null,
      aggregateLabel: null,
      isLoading: false,
    }),
  }),
);
jest.mock('@/views/hooks/useGetCurrentViewOnly', () => ({
  useGetCurrentViewOnly: () => ({
    currentView: { id: 'people-view', viewFields: mockViewFields },
  }),
}));
jest.mock('@/views/hooks/internal/usePerformViewFieldApiPersist', () => ({
  usePerformViewFieldApiPersist: () => ({
    performViewFieldApiUpdate: mockPerformViewFieldApiUpdate,
  }),
}));

const personMetadataItem = getMockObjectMetadataItemOrThrow('person');
const companyFieldMetadataItem = getMockFieldMetadataItemOrThrow({
  objectMetadataItem: personMetadataItem,
  fieldName: 'company',
});

const companyViewField: ViewField = {
  id: 'company-view-field',
  fieldMetadataId: companyFieldMetadataItem.id,
  position: 1,
  isActive: true,
  isVisible: true,
  size: 150,
};
const companyDomainNameViewField: ViewField = {
  ...companyViewField,
  id: 'company-domain-name-view-field',
  position: 2,
  size: 220,
  subFieldName: 'domainName',
};

const toRecordField = (viewField: ViewField): RecordField => ({
  id: viewField.id,
  fieldMetadataItemId: viewField.fieldMetadataId,
  position: viewField.position,
  isVisible: viewField.isVisible,
  size: viewField.size,
  subFieldName: viewField.subFieldName,
});

const renderFooterCells = (viewFields: ViewField[]) => {
  mockViewFields = viewFields;

  render(
    <I18nProvider i18n={i18n}>
      <JotaiProvider store={createStore()}>
        <ViewComponentInstanceContext.Provider
          value={{ instanceId: 'people-view-instance' }}
        >
          <ScrollWrapperComponentInstanceContext.Provider
            value={{ instanceId: 'people-table-scroll' }}
          >
            <RecordTableContextProvider
              value={{
                recordTableId: 'people-table',
                viewBarId: 'people-view-bar',
                objectNameSingular: personMetadataItem.nameSingular,
                objectMetadataItem: personMetadataItem,
                objectMetadataItems: getTestEnrichedObjectMetadataItemsMock(),
                objectPermissions: {
                  canCreateAllRecords: true,
                  canReadAllRecords: true,
                  canUpdateAllRecords: true,
                  canSoftDeleteAllRecords: true,
                  canDestroyAllRecords: true,
                  unreadableFields: [],
                  uneditableFields: [],
                },
                isObjectReadOnly: false,
                visibleRecordFields: viewFields.map(toRecordField),
                triggerEvent: 'CLICK',
              }}
            >
              {viewFields.map((viewField) => (
                <RecordTableColumnAggregateFooterCellContext.Provider
                  key={viewField.id}
                  value={{
                    viewFieldId: viewField.id,
                    fieldMetadataId: viewField.fieldMetadataId,
                  }}
                >
                  <RecordTableColumnFooterWithDropdown isFirstCell />
                </RecordTableColumnAggregateFooterCellContext.Provider>
              ))}
            </RecordTableContextProvider>
          </ScrollWrapperComponentInstanceContext.Provider>
        </ViewComponentInstanceContext.Provider>
      </JotaiProvider>
    </I18nProvider>,
  );
};

const chooseCountAllInOpenMenu = async (
  user: ReturnType<typeof userEvent.setup>,
) => {
  const menu = screen.getByRole('dialog');

  await user.click(within(menu).getByRole('button', { name: 'Count' }));
  await user.click(
    await within(menu).findByRole('button', { name: 'Count all' }),
  );
};

describe('RecordTableColumnFooterWithDropdown', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens only the footer menu of the clicked column and saves on its own view field', async () => {
    const user = userEvent.setup();

    renderFooterCells([companyViewField, companyDomainNameViewField]);

    const [, companyDomainNameFooter] = screen.getAllByRole('button', {
      name: 'Calculate',
    });

    await user.click(companyDomainNameFooter);

    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    await chooseCountAllInOpenMenu(user);

    expect(mockPerformViewFieldApiUpdate).toHaveBeenCalledTimes(1);
    expect(mockPerformViewFieldApiUpdate).toHaveBeenCalledWith([
      {
        input: {
          id: companyDomainNameViewField.id,
          update: expect.objectContaining({
            aggregateOperation: AggregateOperations.COUNT,
            size: companyDomainNameViewField.size,
          }),
        },
      },
    ]);
  });

  it('saves the relation column aggregate on the relation view field when a sub-field column comes first', async () => {
    const user = userEvent.setup();

    renderFooterCells([
      { ...companyDomainNameViewField, position: 1 },
      { ...companyViewField, position: 2 },
    ]);

    const [, companyFooter] = screen.getAllByRole('button', {
      name: 'Calculate',
    });

    await user.click(companyFooter);
    await chooseCountAllInOpenMenu(user);

    expect(mockPerformViewFieldApiUpdate).toHaveBeenCalledWith([
      expect.objectContaining({
        input: expect.objectContaining({ id: companyViewField.id }),
      }),
    ]);
  });
});
