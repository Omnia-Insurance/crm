import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
import { AppPath, OpenRecordIn } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { formatFieldMetadataItemAsFieldDefinition } from '@/object-metadata/utils/formatFieldMetadataItemAsFieldDefinition';
import { type RelationSubFieldMetadata } from '@/object-record/record-field/types/RelationSubFieldMetadata';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { type FieldDefinition } from '@/object-record/record-field/ui/types/FieldDefinition';
import { buildRelationSubFieldDefinition } from '@/object-record/record-field/utils/buildRelationSubFieldDefinition';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { RecordTableRelationSubFieldCellButtons } from '@/object-record/record-table/record-table-cell/components/RecordTableRelationSubFieldCellButtons';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { getMockFieldMetadataItemOrThrow } from '~/testing/utils/getMockFieldMetadataItemOrThrow';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';

jest.mock('@/object-record/record-table/contexts/RecordTableContext', () => ({
  useRecordTableContextOrThrow: jest.fn(),
}));

jest.mock('@/object-record/record-index/hooks/useResolveOpenRecordIn', () => ({
  useResolveOpenRecordIn: jest.fn(),
}));

jest.mock('@/side-panel/hooks/useOpenRecordInSidePanel', () => ({
  useOpenRecordInSidePanel: jest.fn(),
}));

jest.mock('~/hooks/useNavigateApp', () => ({
  useNavigateApp: jest.fn(),
}));

jest.mock('~/hooks/useCopyToClipboard', () => ({
  useCopyToClipboard: jest.fn(),
}));

jest.mock('@/activities/emails/hooks/useOpenEmailInAppOrFallback', () => ({
  useOpenEmailInAppOrFallback: () => ({ openEmail: jest.fn() }),
}));

const { useRecordTableContextOrThrow } = jest.requireMock(
  '@/object-record/record-table/contexts/RecordTableContext',
);
const { useResolveOpenRecordIn } = jest.requireMock(
  '@/object-record/record-index/hooks/useResolveOpenRecordIn',
);
const { useOpenRecordInSidePanel } = jest.requireMock(
  '@/side-panel/hooks/useOpenRecordInSidePanel',
);
const { useNavigateApp } = jest.requireMock('~/hooks/useNavigateApp');
const { useCopyToClipboard } = jest.requireMock('~/hooks/useCopyToClipboard');

const objectMetadataItems = getTestEnrichedObjectMetadataItemsMock();
const opportunityMetadataItem = getMockObjectMetadataItemOrThrow('opportunity');
const personMetadataItem = getMockObjectMetadataItemOrThrow('person');

const pointOfContactFieldDefinition = formatFieldMetadataItemAsFieldDefinition({
  field: getMockFieldMetadataItemOrThrow({
    objectMetadataItem: opportunityMetadataItem,
    fieldName: 'pointOfContact',
  }),
  objectMetadataItem: opportunityMetadataItem,
});

const getPointOfContactColumnDefinition = (
  subFieldName: string,
): FieldDefinition<RelationSubFieldMetadata> => {
  const columnDefinition = buildRelationSubFieldDefinition({
    relationFieldDefinition: pointOfContactFieldDefinition,
    subFieldName,
    objectMetadataItems,
  });

  if (!isDefined(columnDefinition)) {
    throw new Error(`No point of contact column for ${subFieldName}`);
  }

  return columnDefinition;
};

const JANE = {
  __typename: 'Person',
  id: 'person-id',
  emails: { primaryEmail: 'jane@acme.com', additionalEmails: null },
  phones: {
    primaryPhoneNumber: '5550100',
    primaryPhoneCallingCode: '+1',
    primaryPhoneCountryCode: 'US',
    additionalPhones: null,
  },
};

const openRecordInSidePanel = jest.fn();
const navigate = jest.fn();
const copyToClipboard = jest.fn();

const renderCellButtons = ({
  subFieldName,
  pointOfContact,
  isForbidden = false,
}: {
  subFieldName: string;
  pointOfContact: ObjectRecord | null;
  isForbidden?: boolean;
}) => {
  const store = createStore();
  const columnDefinition = getPointOfContactColumnDefinition(subFieldName);

  store.set(recordStoreFamilyState.atomFamily('opportunity-id'), {
    __typename: 'Opportunity',
    id: 'opportunity-id',
    pointOfContact,
  });

  // The sub-field display hydrates the related record into the store before any hover
  if (isDefined(pointOfContact)) {
    store.set(
      recordStoreFamilyState.atomFamily(pointOfContact.id),
      pointOfContact,
    );
  }

  return render(
    <JotaiProvider store={store}>
      <I18nProvider i18n={i18n}>
        <FieldContext.Provider
          value={{
            recordId: 'opportunity-id',
            fieldDefinition: columnDefinition,
            isLabelIdentifier: false,
            isRecordFieldReadOnly: true,
            isForbidden,
          }}
        >
          <RecordTableRelationSubFieldCellButtons
            fieldDefinition={columnDefinition}
          />
        </FieldContext.Provider>
      </I18nProvider>
    </JotaiProvider>,
  );
};

describe('RecordTableRelationSubFieldCellButtons', () => {
  beforeEach(() => {
    useRecordTableContextOrThrow.mockReturnValue({ objectMetadataItems });
    useResolveOpenRecordIn.mockReturnValue(OpenRecordIn.SIDE_PANEL);
    useOpenRecordInSidePanel.mockReturnValue({ openRecordInSidePanel });
    useNavigateApp.mockReturnValue(navigate);
    useCopyToClipboard.mockReturnValue({ copyToClipboard });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('opens the related record in the side panel', async () => {
    const user = userEvent.setup();

    renderCellButtons({ subFieldName: 'jobTitle', pointOfContact: JANE });

    await user.click(
      screen.getByRole('button', { name: 'Open related record' }),
    );

    expect(useResolveOpenRecordIn).toHaveBeenCalledWith('person');
    expect(openRecordInSidePanel).toHaveBeenCalledWith({
      recordId: 'person-id',
      objectNameSingular: 'person',
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('opens the related record page when records open as a page', async () => {
    const user = userEvent.setup();

    useResolveOpenRecordIn.mockReturnValue(OpenRecordIn.RECORD_PAGE);

    renderCellButtons({ subFieldName: 'jobTitle', pointOfContact: JANE });

    await user.click(
      screen.getByRole('button', { name: 'Open related record' }),
    );

    expect(navigate).toHaveBeenCalledWith(AppPath.RecordShowPage, {
      objectNameSingular: 'person',
      objectRecordId: 'person-id',
    });
    expect(openRecordInSidePanel).not.toHaveBeenCalled();
  });

  it.each([
    { subFieldName: 'emails', copiedValue: 'jane@acme.com' },
    { subFieldName: 'phones', copiedValue: '+15550100' },
  ])(
    "copies the related record's $subFieldName, not the row's relation",
    async ({ subFieldName, copiedValue }) => {
      const user = userEvent.setup();

      renderCellButtons({ subFieldName, pointOfContact: JANE });

      await user.click(screen.getByRole('button', { name: 'Copy' }));

      expect(copyToClipboard).toHaveBeenCalledWith(
        copiedValue,
        expect.any(String),
      );
    },
  );

  it('renders no buttons when the relation is empty', () => {
    renderCellButtons({ subFieldName: 'emails', pointOfContact: null });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders no buttons when the cell is not shared', () => {
    renderCellButtons({
      subFieldName: 'emails',
      pointOfContact: JANE,
      isForbidden: true,
    });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders no buttons when the server restricted the value', () => {
    renderCellButtons({
      subFieldName: 'emails',
      pointOfContact: {
        ...JANE,
        emails: FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
      },
    });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders no buttons when the role cannot read the sub-field', () => {
    const personEmailsFieldMetadataItem = getMockFieldMetadataItemOrThrow({
      objectMetadataItem: personMetadataItem,
      fieldName: 'emails',
    });

    useRecordTableContextOrThrow.mockReturnValue({
      objectMetadataItems: objectMetadataItems.map(
        (objectMetadataItem): EnrichedObjectMetadataItem =>
          objectMetadataItem.id === personMetadataItem.id
            ? {
                ...objectMetadataItem,
                readableFields: objectMetadataItem.readableFields.filter(
                  (field) => field.id !== personEmailsFieldMetadataItem.id,
                ),
              }
            : objectMetadataItem,
      ),
    });

    renderCellButtons({ subFieldName: 'emails', pointOfContact: JANE });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
