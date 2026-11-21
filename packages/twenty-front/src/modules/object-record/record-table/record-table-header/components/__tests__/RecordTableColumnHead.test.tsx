import { render, screen } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type RecordField } from '@/object-record/record-field/types/RecordField';
import { FieldDescriptionTooltipProvider } from '@/object-record/record-field/ui/components/FieldDescriptionTooltipProvider';
import { RecordTableContextProvider } from '@/object-record/record-table/contexts/RecordTableContext';
import { RecordTableColumnHead } from '@/object-record/record-table/record-table-header/components/RecordTableColumnHead';
import { getMockFieldMetadataItemOrThrow } from '~/testing/utils/getMockFieldMetadataItemOrThrow';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';
import { setTestObjectMetadataItemsInMetadataStore } from '~/testing/utils/setTestObjectMetadataItemsInMetadataStore';

const RELATION_FIELD_DESCRIPTION = 'Company the person works for';
const SUB_FIELD_DESCRIPTION = 'Main website of the company';

const personMetadataItem = getMockObjectMetadataItemOrThrow('person');
const companyRelationFieldMetadataItem = getMockFieldMetadataItemOrThrow({
  objectMetadataItem: personMetadataItem,
  fieldName: 'company',
});
const domainNameFieldMetadataItem = getMockFieldMetadataItemOrThrow({
  objectMetadataItem: getMockObjectMetadataItemOrThrow('company'),
  fieldName: 'domainName',
});

const withTestDescription = (
  fieldMetadataItem: FieldMetadataItem,
): FieldMetadataItem => {
  if (fieldMetadataItem.id === companyRelationFieldMetadataItem.id) {
    return { ...fieldMetadataItem, description: RELATION_FIELD_DESCRIPTION };
  }

  if (fieldMetadataItem.id === domainNameFieldMetadataItem.id) {
    return { ...fieldMetadataItem, description: SUB_FIELD_DESCRIPTION };
  }

  return fieldMetadataItem;
};

const getObjectMetadataItems = ({
  isSubFieldReadable,
}: {
  isSubFieldReadable: boolean;
}): EnrichedObjectMetadataItem[] =>
  getTestEnrichedObjectMetadataItemsMock().map((objectMetadataItem) => ({
    ...objectMetadataItem,
    fields: objectMetadataItem.fields.map(withTestDescription),
    readableFields: objectMetadataItem.readableFields
      .map(withTestDescription)
      .filter(
        (fieldMetadataItem) =>
          isSubFieldReadable ||
          fieldMetadataItem.id !== domainNameFieldMetadataItem.id,
      ),
  }));

const renderColumnHead = ({
  subFieldName,
  isSubFieldReadable = true,
}: {
  subFieldName?: string;
  isSubFieldReadable?: boolean;
}) => {
  const objectMetadataItems = getObjectMetadataItems({ isSubFieldReadable });
  const store = createStore();

  setTestObjectMetadataItemsInMetadataStore(store, objectMetadataItems);

  const recordField: RecordField = {
    id: 'view-field-id',
    fieldMetadataItemId: companyRelationFieldMetadataItem.id,
    position: 1,
    isVisible: true,
    size: 150,
    subFieldName,
  };

  render(
    <JotaiProvider store={store}>
      <FieldDescriptionTooltipProvider>
        <RecordTableContextProvider
          value={{
            recordTableId: 'record-table-id',
            viewBarId: 'view-bar-id',
            objectNameSingular: personMetadataItem.nameSingular,
            objectMetadataItem: personMetadataItem,
            objectMetadataItems,
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
            visibleRecordFields: [recordField],
            triggerEvent: 'CLICK',
          }}
        >
          <RecordTableColumnHead recordField={recordField} />
        </RecordTableContextProvider>
      </FieldDescriptionTooltipProvider>
    </JotaiProvider>,
  );
};

describe('RecordTableColumnHead', () => {
  it('shows the relation label and description for a plain column', () => {
    renderColumnHead({});

    expect(
      screen.getByText(companyRelationFieldMetadataItem.label),
    ).toHaveAccessibleDescription(RELATION_FIELD_DESCRIPTION);
  });

  it('shows the readable sub-field label and description for a sub-field column', () => {
    renderColumnHead({ subFieldName: domainNameFieldMetadataItem.name });

    expect(
      screen.getByText(
        `${companyRelationFieldMetadataItem.label} / ${domainNameFieldMetadataItem.label}`,
      ),
    ).toHaveAccessibleDescription(SUB_FIELD_DESCRIPTION);
    expect(
      screen.queryByText(RELATION_FIELD_DESCRIPTION),
    ).not.toBeInTheDocument();
  });

  it('shows only the raw sub-field name when the role cannot read the sub-field', () => {
    renderColumnHead({
      subFieldName: domainNameFieldMetadataItem.name,
      isSubFieldReadable: false,
    });

    expect(
      screen.getByText(
        `${companyRelationFieldMetadataItem.label} / ${domainNameFieldMetadataItem.name}`,
      ),
    ).not.toHaveAccessibleDescription();
    expect(screen.queryByText(SUB_FIELD_DESCRIPTION)).not.toBeInTheDocument();
    expect(
      screen.queryByText(RELATION_FIELD_DESCRIPTION),
    ).not.toBeInTheDocument();
  });
});
