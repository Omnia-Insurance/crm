import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED } from 'twenty-shared/constants';
import { type ObjectRecordsPermissions } from 'twenty-shared/types';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { formatFieldMetadataItemAsFieldDefinition } from '@/object-metadata/utils/formatFieldMetadataItemAsFieldDefinition';
import { type RelationSubFieldMetadata } from '@/object-record/record-field/types/RelationSubFieldMetadata';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { RelationSubFieldDisplay } from '@/object-record/record-field/ui/meta-types/display/components/RelationSubFieldDisplay';
import { type FieldDefinition } from '@/object-record/record-field/ui/types/FieldDefinition';
import { type FieldRelationMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { getMockFieldMetadataItemOrThrow } from '~/testing/utils/getMockFieldMetadataItemOrThrow';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: jest.fn(),
}));

jest.mock('@/object-record/hooks/useObjectPermissions', () => ({
  useObjectPermissions: jest.fn(),
}));

// The native displays are covered on their own; this one echoes what it was asked to render
jest.mock('@/object-record/record-field/ui/components/FieldDisplay', () => {
  const { useContext } = jest.requireActual('react');
  const { FieldContext: ActualFieldContext } = jest.requireActual(
    '@/object-record/record-field/ui/contexts/FieldContext',
  );
  const { useRecordFieldValue } = jest.requireActual(
    '@/object-record/record-store/hooks/useRecordFieldValue',
  );

  return {
    FieldDisplay: () => {
      const { recordId, fieldDefinition } = useContext(ActualFieldContext);
      const fieldValue = useRecordFieldValue(
        recordId,
        fieldDefinition.metadata.fieldName,
        fieldDefinition,
      );

      return (
        <span>{`${fieldDefinition.metadata.fieldName} of ${recordId}: ${fieldValue}`}</span>
      );
    },
  };
});

const { useObjectMetadataItems } = jest.requireMock(
  '@/object-metadata/hooks/useObjectMetadataItems',
);
const { useObjectPermissions } = jest.requireMock(
  '@/object-record/hooks/useObjectPermissions',
);

const objectMetadataItems = getTestEnrichedObjectMetadataItemsMock();
const personMetadataItem = getMockObjectMetadataItemOrThrow('person');
const companyMetadataItem = getMockObjectMetadataItemOrThrow('company');
const companyNameFieldMetadataItem = getMockFieldMetadataItemOrThrow({
  objectMetadataItem: companyMetadataItem,
  fieldName: 'name',
});

const companyRelationFieldDefinition = formatFieldMetadataItemAsFieldDefinition(
  {
    field: getMockFieldMetadataItemOrThrow({
      objectMetadataItem: personMetadataItem,
      fieldName: 'company',
    }),
    objectMetadataItem: personMetadataItem,
  },
) as FieldDefinition<FieldRelationMetadata>;

const companyNameColumnDefinition: FieldDefinition<RelationSubFieldMetadata> = {
  ...companyRelationFieldDefinition,
  fieldMetadataId: `${companyRelationFieldDefinition.fieldMetadataId}.name`,
  type: companyNameFieldMetadataItem.type,
  metadata: {
    ...companyRelationFieldDefinition.metadata,
    subFieldName: 'name',
  },
};

const UNREADABLE_OBJECT_PERMISSIONS: ObjectRecordsPermissions = {
  canCreateAllRecords: false,
  canReadAllRecords: false,
  canUpdateAllRecords: false,
  canSoftDeleteAllRecords: false,
  canDestroyAllRecords: false,
  unreadableFields: [],
  uneditableFields: [],
};

const renderSubFieldCell = ({
  company,
}: {
  company: Partial<ObjectRecord> | null;
}) => {
  const store = createStore();

  store.set(recordStoreFamilyState.atomFamily('person-id'), {
    __typename: 'Person',
    id: 'person-id',
    company,
  });

  return render(
    <JotaiProvider store={store}>
      <I18nProvider i18n={i18n}>
        <FieldContext.Provider
          value={{
            recordId: 'person-id',
            fieldDefinition: companyNameColumnDefinition,
            isLabelIdentifier: false,
            isRecordFieldReadOnly: true,
          }}
        >
          <RelationSubFieldDisplay />
        </FieldContext.Provider>
      </I18nProvider>
    </JotaiProvider>,
  );
};

const ACME_COMPANY = { __typename: 'Company', id: 'company-id', name: 'Acme' };

describe('RelationSubFieldDisplay', () => {
  beforeEach(() => {
    useObjectMetadataItems.mockReturnValue({ objectMetadataItems });
    useObjectPermissions.mockReturnValue({
      objectPermissionsByObjectMetadataId: {},
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the related record's field through the native display", () => {
    renderSubFieldCell({ company: ACME_COMPANY });

    expect(screen.getByText('name of company-id: Acme')).toBeInTheDocument();
  });

  it('shows the lock when the role cannot read the sub-field', () => {
    useObjectMetadataItems.mockReturnValue({
      objectMetadataItems: objectMetadataItems.map(
        (objectMetadataItem): EnrichedObjectMetadataItem =>
          objectMetadataItem.id === companyMetadataItem.id
            ? {
                ...objectMetadataItem,
                readableFields: objectMetadataItem.readableFields.filter(
                  (field) => field.id !== companyNameFieldMetadataItem.id,
                ),
              }
            : objectMetadataItem,
      ),
    });

    renderSubFieldCell({ company: ACME_COMPANY });

    expect(screen.getByText('Not shared')).toBeInTheDocument();
    expect(screen.queryByText(/Acme/)).not.toBeInTheDocument();
  });

  it('shows the lock when the role cannot read the related object', () => {
    useObjectPermissions.mockReturnValue({
      objectPermissionsByObjectMetadataId: {
        [companyMetadataItem.id]: UNREADABLE_OBJECT_PERMISSIONS,
      },
    });

    renderSubFieldCell({ company: ACME_COMPANY });

    expect(screen.getByText('Not shared')).toBeInTheDocument();
    expect(screen.queryByText(/Acme/)).not.toBeInTheDocument();
  });

  it('shows the lock when the server restricted the value', () => {
    renderSubFieldCell({
      company: {
        ...ACME_COMPANY,
        name: FIELD_RESTRICTED_ADDITIONAL_PERMISSIONS_REQUIRED,
      },
    });

    expect(screen.getByText('Not shared')).toBeInTheDocument();
  });

  it('renders an empty cell when the relation is empty', () => {
    renderSubFieldCell({ company: null });

    expect(screen.queryByText('Not shared')).not.toBeInTheDocument();
    expect(screen.queryByText(/name of/)).not.toBeInTheDocument();
  });
});
