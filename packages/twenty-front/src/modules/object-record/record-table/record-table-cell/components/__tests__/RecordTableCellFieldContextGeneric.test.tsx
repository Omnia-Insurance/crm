import { render, screen } from '@testing-library/react';
import { memo, useContext } from 'react';
import { type ObjectRecordsPermissions } from 'twenty-shared/types';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { formatFieldMetadataItemAsColumnDefinition } from '@/object-metadata/utils/formatFieldMetadataItemAsColumnDefinition';
import { getDefaultObjectPermissions } from '@/object-metadata/utils/getDefaultObjectPermissions';
import { type RecordField } from '@/object-record/record-field/types/RecordField';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { RecordTableCellFieldContextGeneric } from '@/object-record/record-table/record-table-cell/components/RecordTableCellFieldContextGeneric';
import { getMockFieldMetadataItemOrThrow } from '~/testing/utils/getMockFieldMetadataItemOrThrow';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';

jest.mock(
  '@/object-record/record-table/contexts/RecordTableRowContext',
  () => ({
    useRecordTableRowContextOrThrow: jest.fn(),
  }),
);

jest.mock('@/object-record/record-table/contexts/RecordTableContext', () => ({
  useRecordTableContextOrThrow: jest.fn(),
}));

jest.mock('@/object-record/record-index/contexts/RecordIndexContext', () => ({
  useRecordIndexContextOrThrow: jest.fn(),
}));

jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: () => false,
  }),
);

const { useRecordTableRowContextOrThrow } = jest.requireMock(
  '@/object-record/record-table/contexts/RecordTableRowContext',
);
const { useRecordTableContextOrThrow } = jest.requireMock(
  '@/object-record/record-table/contexts/RecordTableContext',
);
const { useRecordIndexContextOrThrow } = jest.requireMock(
  '@/object-record/record-index/contexts/RecordIndexContext',
);

const objectMetadataItems = getTestEnrichedObjectMetadataItemsMock();
const opportunityMetadataItem = getMockObjectMetadataItemOrThrow('opportunity');
const personMetadataItem = getMockObjectMetadataItemOrThrow('person');

const pointOfContactFieldMetadataItem = getMockFieldMetadataItemOrThrow({
  objectMetadataItem: opportunityMetadataItem,
  fieldName: 'pointOfContact',
});

const personEmailsFieldMetadataItem = getMockFieldMetadataItemOrThrow({
  objectMetadataItem: personMetadataItem,
  fieldName: 'emails',
});

const UNREADABLE_OBJECT_PERMISSIONS: ObjectRecordsPermissions = {
  canCreateAllRecords: false,
  canReadAllRecords: false,
  canUpdateAllRecords: false,
  canSoftDeleteAllRecords: false,
  canDestroyAllRecords: false,
  unreadableFields: [],
  uneditableFields: [],
};

const POINT_OF_CONTACT_COLUMN: RecordField = {
  id: 'point-of-contact-view-field-id',
  fieldMetadataItemId: pointOfContactFieldMetadataItem.id,
  position: 1,
  isVisible: true,
  size: 150,
};

const POINT_OF_CONTACT_EMAILS_COLUMN: RecordField = {
  ...POINT_OF_CONTACT_COLUMN,
  id: 'point-of-contact-emails-view-field-id',
  position: 2,
  subFieldName: 'emails',
};

const renderProbe = jest.fn();

// A memoized consumer only re-renders when the context value changes
const FieldContextProbe = memo(() => {
  const { fieldDefinition, isRecordFieldReadOnly, isForbidden } =
    useContext(FieldContext);

  renderProbe();

  return (
    <span>
      {`${fieldDefinition.label} | ${isForbidden === true ? 'Not shared' : 'Shared'} | ${isRecordFieldReadOnly ? 'Read-only' : 'Editable'}`}
    </span>
  );
});

const mockCellContexts = ({
  objectPermissionsByObjectMetadataId = {},
  restrictedFieldNames = [],
  enrichedObjectMetadataItems = objectMetadataItems,
}: {
  objectPermissionsByObjectMetadataId?: Record<
    string,
    ObjectRecordsPermissions
  >;
  restrictedFieldNames?: string[];
  enrichedObjectMetadataItems?: EnrichedObjectMetadataItem[];
}) => {
  useRecordTableRowContextOrThrow.mockReturnValue({
    recordId: 'opportunity-id',
    isRecordReadOnly: false,
    restrictedFieldNames,
  });

  useRecordTableContextOrThrow.mockReturnValue({
    objectMetadataItem: opportunityMetadataItem,
    objectMetadataItems: enrichedObjectMetadataItems,
    objectPermissions: getDefaultObjectPermissions(),
  });

  useRecordIndexContextOrThrow.mockReturnValue({
    objectPermissionsByObjectMetadataId,
    fieldMetadataItemByFieldMetadataItemId: {
      [pointOfContactFieldMetadataItem.id]: pointOfContactFieldMetadataItem,
    },
    fieldDefinitionByFieldMetadataItemId: {
      [pointOfContactFieldMetadataItem.id]:
        formatFieldMetadataItemAsColumnDefinition({
          field: pointOfContactFieldMetadataItem,
          objectMetadataItem: opportunityMetadataItem,
          position: 1,
        }),
    },
  });
};

const renderCell = (recordField: RecordField) =>
  render(
    <RecordTableCellFieldContextGeneric recordField={recordField}>
      <FieldContextProbe />
    </RecordTableCellFieldContextGeneric>,
  );

describe('RecordTableCellFieldContextGeneric', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('keeps a plain relation column editable', () => {
    mockCellContexts({});

    renderCell(POINT_OF_CONTACT_COLUMN);

    expect(
      screen.getByText('Point of Contact | Shared | Editable'),
    ).toBeInTheDocument();
  });

  it('renders a relation sub-field column as a read-only column of the target field', () => {
    mockCellContexts({});

    renderCell(POINT_OF_CONTACT_EMAILS_COLUMN);

    expect(
      screen.getByText(
        `Point of Contact / ${personEmailsFieldMetadataItem.label} | Shared | Read-only`,
      ),
    ).toBeInTheDocument();
  });

  it('shows a sub-field column as not shared when the role cannot read the related object', () => {
    mockCellContexts({
      objectPermissionsByObjectMetadataId: {
        [personMetadataItem.id]: UNREADABLE_OBJECT_PERMISSIONS,
      },
    });

    renderCell(POINT_OF_CONTACT_EMAILS_COLUMN);

    expect(screen.getByText(/\| Not shared \|/)).toBeInTheDocument();
  });

  it('shows a sub-field column as not shared when the role cannot read the sub-field', () => {
    mockCellContexts({
      enrichedObjectMetadataItems: objectMetadataItems.map(
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

    renderCell(POINT_OF_CONTACT_EMAILS_COLUMN);

    expect(
      screen.getByText('Point of Contact | Not shared | Read-only'),
    ).toBeInTheDocument();
  });

  it('shows a sub-field column as not shared when the record restricts the relation', () => {
    mockCellContexts({
      restrictedFieldNames: [pointOfContactFieldMetadataItem.name],
    });

    renderCell(POINT_OF_CONTACT_EMAILS_COLUMN);

    expect(screen.getByText(/\| Not shared \|/)).toBeInTheDocument();
  });

  it('hands consumers the same value while its inputs are unchanged', () => {
    mockCellContexts({});

    const { rerender } = renderCell(POINT_OF_CONTACT_EMAILS_COLUMN);

    rerender(
      <RecordTableCellFieldContextGeneric
        recordField={POINT_OF_CONTACT_EMAILS_COLUMN}
      >
        <FieldContextProbe />
      </RecordTableCellFieldContextGeneric>,
    );

    expect(renderProbe).toHaveBeenCalledTimes(1);
  });
});
