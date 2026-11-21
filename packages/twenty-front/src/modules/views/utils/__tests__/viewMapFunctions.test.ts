import { type RecordField } from '@/object-record/record-field/types/RecordField';
import { type FieldMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';
import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import { type ColumnDefinition } from '@/object-record/record-table/types/ColumnDefinition';
import { type ViewField } from '@/views/types/ViewField';
import { type ViewFilter } from '@/views/types/ViewFilter';
import { mapRecordFieldToViewField } from '@/views/utils/mapRecordFieldToViewField';
import { mapViewFieldToRecordField } from '@/views/utils/mapViewFieldToRecordField';
import { mapViewFieldsToColumnDefinitions } from '@/views/utils/mapViewFieldsToColumnDefinitions';
import { mapViewFiltersToFilters } from '@/views/utils/mapViewFiltersToFilters';
import { ViewFilterOperand } from 'twenty-shared/types';

import { FieldMetadataType } from '~/generated-metadata/graphql';

const baseFieldMetadataItem = {
  id: '05731f68-6e7a-4903-8374-c0b6a9063482',
  universalIdentifier: '05731f68-6e7a-4903-8374-c0b6a9063482',
  createdAt: '2021-01-01',
  updatedAt: '2021-01-01',
  name: 'name',
  label: 'Name',
  type: FieldMetadataType.FULL_NAME,
};

describe('mapViewFiltersToFilters', () => {
  it('should map each ViewFilter object to a corresponding Filter object', () => {
    const viewFilters: ViewFilter[] = [
      {
        id: 'id',
        fieldMetadataId: '05731f68-6e7a-4903-8374-c0b6a9063482',
        value: 'testValue',
        displayValue: 'Test Display Value',
        operand: ViewFilterOperand.IS,
      },
    ];

    const expectedFilters: RecordFilter[] = [
      {
        id: 'id',
        fieldMetadataId: '05731f68-6e7a-4903-8374-c0b6a9063482',
        value: 'testValue',
        displayValue: 'Test Display Value',
        operand: ViewFilterOperand.IS,
        label: baseFieldMetadataItem.label,
        type: FieldMetadataType.FULL_NAME,
        positionInRecordFilterGroup: undefined,
        recordFilterGroupId: undefined,
        subFieldName: undefined,
        relationTargetFieldMetadataId: null,
      },
    ];
    expect(
      mapViewFiltersToFilters(viewFilters, [baseFieldMetadataItem]),
    ).toEqual(expectedFilters);
  });
});

describe('mapViewFieldsToColumnDefinitions', () => {
  it('should map visible ViewFields to ColumnDefinitions and filter out missing fieldMetadata', () => {
    const viewFields: ViewField[] = [
      {
        id: '1',
        fieldMetadataId: '1',
        position: 1,
        size: 1,
        isVisible: false,
        isActive: true,
        definition: {
          fieldMetadataId: '1',
          label: 'label 1',
          metadata: { fieldName: 'fieldName 1' },
          iconName: 'iconName 1',
          type: FieldMetadataType.TEXT,
          position: 1,
          size: 1,
          isVisible: false,
          viewFieldId: '1',
        },
      },
      {
        id: '2',
        fieldMetadataId: '2',
        position: 2,
        size: 2,
        isVisible: false,
        isActive: true,
        definition: {
          fieldMetadataId: '2',
          label: 'label 2',
          metadata: { fieldName: 'fieldName 2' },
          iconName: 'iconName 2',
          type: FieldMetadataType.TEXT,
          position: 2,
          size: 1,
          isVisible: false,
          viewFieldId: '2',
        },
      },
      {
        id: '3',
        fieldMetadataId: '3',
        position: 3,
        size: 3,
        isVisible: true,
        isActive: true,
        definition: {
          fieldMetadataId: '3',
          label: 'label 3',
          metadata: { fieldName: 'fieldName 3' },
          iconName: 'iconName 3',
          type: FieldMetadataType.TEXT,
          position: 3,
          size: 1,
          isVisible: false,
          viewFieldId: '3',
        },
      },
    ];

    const columnDefinitions: ColumnDefinition<FieldMetadata>[] = [
      {
        fieldMetadataId: '1',
        label: 'label 1',
        position: 1,
        metadata: { fieldName: 'fieldName 1' },
        iconName: 'iconName 1',
        type: FieldMetadataType.TEXT,
        size: 1,
      },
      {
        fieldMetadataId: '3',
        label: 'label 3',
        position: 3,
        metadata: { fieldName: 'fieldName 3' },
        iconName: 'iconName 3',
        type: FieldMetadataType.TEXT,
        size: 3,
      },
    ];

    const expectedColumnDefinitions: ColumnDefinition<FieldMetadata>[] = [
      {
        fieldMetadataId: '1',
        label: 'label 1',
        metadata: { fieldName: 'fieldName 1' },
        iconName: 'iconName 1',
        type: FieldMetadataType.TEXT,
        size: 1,
        position: 1,
        isVisible: false,
        viewFieldId: '1',
      },
      {
        fieldMetadataId: '3',
        label: 'label 3',
        metadata: { fieldName: 'fieldName 3' },
        iconName: 'iconName 3',
        type: FieldMetadataType.TEXT,
        size: 3,
        position: 3,
        isVisible: true,
        viewFieldId: '3',
      },
    ];

    const actualColumnDefinitions = mapViewFieldsToColumnDefinitions({
      columnDefinitions,
      viewFields,
    });

    expect(actualColumnDefinitions).toEqual(expectedColumnDefinitions);
  });
});

// OMNIA-CUSTOM: relation sub-field columns (contract C6)
const leadFieldMetadataId = '6a4b3d3e-8f0c-4c1e-9d7a-2b5e1f0c9a11';

const leadViewField: ViewField = {
  id: 'lead-view-field-id',
  fieldMetadataId: leadFieldMetadataId,
  position: 1,
  size: 150,
  isVisible: true,
  isActive: true,
  subFieldName: null,
};

const leadDateOfBirthViewField: ViewField = {
  id: 'lead-date-of-birth-view-field-id',
  fieldMetadataId: leadFieldMetadataId,
  position: 2,
  size: 180,
  isVisible: true,
  isActive: true,
  subFieldName: 'dateOfBirth',
};

describe('mapViewFieldsToColumnDefinitions with relation sub-field columns', () => {
  it('should skip sub-field view fields and keep the plain relation column', () => {
    const columnDefinitions: ColumnDefinition<FieldMetadata>[] = [
      {
        fieldMetadataId: leadFieldMetadataId,
        label: 'Lead',
        position: 1,
        metadata: { fieldName: 'lead' },
        iconName: 'IconUser',
        type: FieldMetadataType.RELATION,
        size: 150,
      },
    ];

    const expectedColumnDefinitions: ColumnDefinition<FieldMetadata>[] = [
      {
        fieldMetadataId: leadFieldMetadataId,
        label: 'Lead',
        metadata: { fieldName: 'lead' },
        iconName: 'IconUser',
        type: FieldMetadataType.RELATION,
        size: 150,
        position: 1,
        isVisible: true,
        viewFieldId: 'lead-view-field-id',
      },
    ];

    const actualColumnDefinitions = mapViewFieldsToColumnDefinitions({
      columnDefinitions,
      viewFields: [leadViewField, leadDateOfBirthViewField],
    });

    expect(actualColumnDefinitions).toEqual(expectedColumnDefinitions);
  });
});

describe('mapViewFieldToRecordField', () => {
  it('should keep the subFieldName of a sub-field column', () => {
    const expectedRecordField: RecordField = {
      id: 'lead-date-of-birth-view-field-id',
      fieldMetadataItemId: leadFieldMetadataId,
      position: 2,
      size: 180,
      isVisible: true,
      subFieldName: 'dateOfBirth',
    };

    expect(mapViewFieldToRecordField(leadDateOfBirthViewField)).toEqual(
      expectedRecordField,
    );
  });
});

describe('mapRecordFieldToViewField', () => {
  it('should keep the subFieldName of a sub-field column', () => {
    const recordField: RecordField = {
      id: 'lead-date-of-birth-view-field-id',
      fieldMetadataItemId: leadFieldMetadataId,
      position: 2,
      size: 180,
      isVisible: true,
      subFieldName: 'dateOfBirth',
    };

    expect(mapRecordFieldToViewField(recordField)).toEqual({
      id: 'lead-date-of-birth-view-field-id',
      fieldMetadataId: leadFieldMetadataId,
      position: 2,
      size: 180,
      isVisible: true,
      isActive: true,
      subFieldName: 'dateOfBirth',
    });
  });
});
