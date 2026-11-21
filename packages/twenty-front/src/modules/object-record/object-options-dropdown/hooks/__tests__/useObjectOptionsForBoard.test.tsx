import { act, renderHook } from '@testing-library/react';

import { useObjectOptionsForBoard } from '@/object-record/object-options-dropdown/hooks/useObjectOptionsForBoard';
import { type RecordField } from '@/object-record/record-field/types/RecordField';
import { type FieldMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';
import { type ColumnDefinition } from '@/object-record/record-table/types/ColumnDefinition';
import { FieldMetadataType } from '~/generated-metadata/graphql';

const LEAD_FIELD_METADATA_ID = 'lead-field';

const mockSaveViewFields = jest.fn();
const mockUpdateRecordField = jest.fn();
const mockUpsertRecordField = jest.fn();
const mockSetRecordIndexFieldDefinitions = jest.fn();

let mockCurrentRecordFields: RecordField[] = [];
let mockRecordIndexFieldDefinitions: ColumnDefinition<FieldMetadata>[] = [];

const leadColumnDefinition: ColumnDefinition<FieldMetadata> = {
  fieldMetadataId: LEAD_FIELD_METADATA_ID,
  label: 'Lead',
  metadata: { fieldName: 'lead' },
  iconName: 'IconUser',
  type: FieldMetadataType.RELATION,
  position: 1,
  size: 150,
};

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({ objectMetadataItem: { id: 'policy' } }),
}));
jest.mock(
  '@/object-metadata/hooks/useColumnDefinitionsFromObjectMetadata',
  () => ({
    useColumnDefinitionsFromObjectMetadata: () => ({
      columnDefinitions: [leadColumnDefinition],
    }),
  }),
);
jest.mock(
  '@/object-record/record-field/hooks/useReorderVisibleRecordFields',
  () => ({
    useReorderVisibleRecordFields: () => ({
      reorderVisibleRecordFields: jest.fn(),
    }),
  }),
);
jest.mock('@/object-record/record-field/hooks/useUpdateRecordField', () => ({
  useUpdateRecordField: () => ({ updateRecordField: mockUpdateRecordField }),
}));
jest.mock('@/object-record/record-field/hooks/useUpsertRecordField', () => ({
  useUpsertRecordField: () => ({ upsertRecordField: mockUpsertRecordField }),
}));
jest.mock('@/views/hooks/useSaveCurrentViewFields', () => ({
  useSaveCurrentViewFields: () => ({ saveViewFields: mockSaveViewFields }),
}));
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomComponentState', () => ({
  useAtomComponentState: () => [
    mockRecordIndexFieldDefinitions,
    mockSetRecordIndexFieldDefinitions,
  ],
}));
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: () => mockCurrentRecordFields,
  }),
);

const leadDateOfBirthRecordField: RecordField = {
  id: 'record-field-lead-date-of-birth',
  fieldMetadataItemId: LEAD_FIELD_METADATA_ID,
  position: 2,
  size: 150,
  isVisible: true,
  subFieldName: 'dateOfBirth',
};

const renderUseObjectOptionsForBoard = () =>
  renderHook(() =>
    useObjectOptionsForBoard({
      objectNameSingular: 'policy',
      recordBoardId: 'policies-board',
      viewBarId: 'policies-board',
    }),
  );

describe('useObjectOptionsForBoard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecordIndexFieldDefinitions = [];
  });

  it('shows the plain relation column, not a sub-field column on the same relation', async () => {
    mockCurrentRecordFields = [
      leadDateOfBirthRecordField,
      {
        id: 'record-field-lead',
        fieldMetadataItemId: LEAD_FIELD_METADATA_ID,
        position: 1,
        size: 150,
        isVisible: false,
      },
    ];
    mockRecordIndexFieldDefinitions = [
      { ...leadColumnDefinition, isVisible: false },
    ];

    const { result } = renderUseObjectOptionsForBoard();

    await act(async () => {
      await result.current.handleBoardFieldVisibilityChange({
        fieldMetadataId: LEAD_FIELD_METADATA_ID,
        isVisible: true,
      });
    });

    expect(mockUpsertRecordField).not.toHaveBeenCalled();
    expect(mockSaveViewFields).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'record-field-lead', isVisible: true }),
    ]);
    expect(mockSaveViewFields).not.toHaveBeenCalledWith([
      expect.objectContaining({ subFieldName: 'dateOfBirth' }),
    ]);
  });

  it('creates the plain relation column when only a sub-field column exists', async () => {
    mockCurrentRecordFields = [leadDateOfBirthRecordField];

    const { result } = renderUseObjectOptionsForBoard();

    await act(async () => {
      await result.current.handleBoardFieldVisibilityChange({
        fieldMetadataId: LEAD_FIELD_METADATA_ID,
        isVisible: true,
      });
    });

    expect(mockUpdateRecordField).not.toHaveBeenCalled();
    expect(mockUpsertRecordField).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldMetadataItemId: LEAD_FIELD_METADATA_ID,
        isVisible: true,
        position: 3,
      }),
    );
    expect(mockUpsertRecordField.mock.calls[0][0].subFieldName).toBeUndefined();
  });
});
