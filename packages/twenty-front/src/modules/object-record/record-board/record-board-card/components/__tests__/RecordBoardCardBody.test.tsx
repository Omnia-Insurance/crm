import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps, type ReactNode, useContext } from 'react';

import { formatFieldMetadataItemAsFieldDefinition } from '@/object-metadata/utils/formatFieldMetadataItemAsFieldDefinition';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { RecordBoardContext } from '@/object-record/record-board/contexts/RecordBoardContext';
import { RecordBoardCardBody } from '@/object-record/record-board/record-board-card/components/RecordBoardCardBody';
import { RecordBoardCardContext } from '@/object-record/record-board/record-board-card/contexts/RecordBoardCardContext';
import { useRecordBoardCardMetadataFromPosition } from '@/object-record/record-board/record-board-card/hooks/useRecordBoardCardMetadataFromPosition';
import { type RecordField } from '@/object-record/record-field/types/RecordField';
import { FieldContext } from '@/object-record/record-field/ui/contexts/FieldContext';
import { getMockFieldMetadataItemOrThrow } from '~/testing/utils/getMockFieldMetadataItemOrThrow';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

const mockOpportunityObjectMetadataItem =
  getMockObjectMetadataItemOrThrow('opportunity');

const [mockNameField, mockCompanyField, mockStageField] = [
  'name',
  'company',
  'stage',
].map((fieldName) =>
  getMockFieldMetadataItemOrThrow({
    objectMetadataItem: mockOpportunityObjectMetadataItem,
    fieldName,
  }),
);

const mockFields = [mockNameField, mockCompanyField, mockStageField];

const mockRecordIndexContextValue = {
  labelIdentifierFieldMetadataItem: mockNameField,
  objectPermissionsByObjectMetadataId: {},
  fieldMetadataItemByFieldMetadataItemId: Object.fromEntries(
    mockFields.map((field) => [field.id, field]),
  ),
  fieldDefinitionByFieldMetadataItemId: Object.fromEntries(
    mockFields.map((field) => [
      field.id,
      formatFieldMetadataItemAsFieldDefinition({
        field,
        objectMetadataItem: mockOpportunityObjectMetadataItem,
      }),
    ]),
  ),
};

const mockSetRecordBoardCardHoverPosition = jest.fn();

let mockVisibleRecordFields: RecordField[] = [];
let mockRecordBoardCardHoverPosition: number | null = null;

const MockRecordInlineCell = () => {
  const { fieldDefinition, onMouseEnter } = useContext(FieldContext);

  return <div onMouseEnter={onMouseEnter}>{fieldDefinition.label}</div>;
};

jest.mock(
  '@/object-record/record-inline-cell/components/RecordInlineCell',
  () => ({
    RecordInlineCell: () => <MockRecordInlineCell />,
  }),
);
jest.mock('@/object-record/record-index/contexts/RecordIndexContext', () => ({
  ...jest.requireActual(
    '@/object-record/record-index/contexts/RecordIndexContext',
  ),
  useRecordIndexContextOrThrow: () => mockRecordIndexContextValue,
}));
jest.mock(
  '@/object-record/record-store/hooks/useRecordRestrictedFieldNames',
  () => ({
    useRecordRestrictedFieldNames: () => [],
  }),
);
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentSelectorValue',
  () => ({
    useAtomComponentSelectorValue: () => mockVisibleRecordFields,
  }),
);
jest.mock('@/ui/utilities/state/jotai/hooks/useSetAtomComponentState', () => ({
  useSetAtomComponentState: () => mockSetRecordBoardCardHoverPosition,
}));
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: (state: unknown) => {
      const { recordBoardCardHoverPositionComponentState } = jest.requireActual(
        '@/object-record/record-board/record-board-card/states/recordBoardCardHoverPositionComponentState',
      );

      return state === recordBoardCardHoverPositionComponentState
        ? mockRecordBoardCardHoverPosition
        : null;
    },
  }),
);

const buildRecordField = (
  recordField: Pick<RecordField, 'id' | 'fieldMetadataItemId' | 'position'> &
    Partial<RecordField>,
): RecordField => ({ isVisible: true, size: 150, ...recordField });

const nameRecordField = buildRecordField({
  id: 'record-field-name',
  fieldMetadataItemId: mockNameField.id,
  position: 0,
});
const companyDomainRecordField = buildRecordField({
  id: 'record-field-company-domain',
  fieldMetadataItemId: mockCompanyField.id,
  position: 1,
  subFieldName: 'domainName',
});
const companyRecordField = buildRecordField({
  id: 'record-field-company',
  fieldMetadataItemId: mockCompanyField.id,
  position: 2,
});
const stageRecordField = buildRecordField({
  id: 'record-field-stage',
  fieldMetadataItemId: mockStageField.id,
  position: 3,
});

const recordBoardContextValue: ComponentProps<
  typeof RecordBoardContext.Provider
>['value'] = {
  objectMetadataItem: mockOpportunityObjectMetadataItem,
  selectFieldMetadataItem: mockStageField,
  createOneRecord: jest.fn(),
  updateOneRecord: jest.fn(),
  deleteOneRecord: jest.fn(),
  recordBoardId: 'opportunities-board',
  objectPermissions: getObjectPermissionsForObject(
    {},
    mockOpportunityObjectMetadataItem.id,
  ),
};

const Wrapper = ({ children }: { children: ReactNode }) => (
  <RecordBoardContext.Provider value={recordBoardContextValue}>
    <RecordBoardCardContext.Provider
      value={{
        recordId: 'opportunity-1',
        isRecordReadOnly: false,
        rowIndex: 0,
        columnIndex: 0,
      }}
    >
      {children}
    </RecordBoardCardContext.Provider>
  </RecordBoardContext.Provider>
);

describe('RecordBoardCardBody', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecordBoardCardHoverPosition = null;
  });

  it('renders a relation once when a table sub-field column shares its field id', () => {
    mockVisibleRecordFields = [
      nameRecordField,
      companyDomainRecordField,
      companyRecordField,
      stageRecordField,
    ];

    render(<RecordBoardCardBody />, { wrapper: Wrapper });

    expect(screen.getAllByText(mockCompanyField.label)).toHaveLength(1);
    expect(screen.getByText(mockStageField.label)).toBeInTheDocument();
  });

  it('renders no relation field when only its sub-field column is visible', () => {
    mockVisibleRecordFields = [
      nameRecordField,
      companyDomainRecordField,
      stageRecordField,
    ];

    render(<RecordBoardCardBody />, { wrapper: Wrapper });

    expect(screen.queryByText(mockCompanyField.label)).not.toBeInTheDocument();
    expect(screen.getByText(mockStageField.label)).toBeInTheDocument();
  });

  it('hovers the field under the cursor, after a skipped sub-field column', async () => {
    mockVisibleRecordFields = [
      nameRecordField,
      companyDomainRecordField,
      stageRecordField,
    ];

    render(<RecordBoardCardBody />, { wrapper: Wrapper });

    await userEvent.hover(screen.getByText(mockStageField.label));

    mockRecordBoardCardHoverPosition =
      mockSetRecordBoardCardHoverPosition.mock.lastCall?.[0] ?? null;

    const { result } = renderHook(
      () => useRecordBoardCardMetadataFromPosition(),
      { wrapper: Wrapper },
    );

    expect(result.current.hoveredFieldMetadataItem?.id).toBe(mockStageField.id);
  });
});
