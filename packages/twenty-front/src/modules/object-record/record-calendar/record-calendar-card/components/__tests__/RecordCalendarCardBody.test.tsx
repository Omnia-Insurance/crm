import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useContext } from 'react';

import { formatFieldMetadataItemAsFieldDefinition } from '@/object-metadata/utils/formatFieldMetadataItemAsFieldDefinition';
import { getObjectPermissionsForObject } from '@/object-metadata/utils/getObjectPermissionsForObject';
import { RecordCalendarContextProvider } from '@/object-record/record-calendar/contexts/RecordCalendarContext';
import { RecordCalendarCardBody } from '@/object-record/record-calendar/record-calendar-card/components/RecordCalendarCardBody';
import { useRecordCalendarCardMetadataFromPosition } from '@/object-record/record-calendar/record-calendar-card/hooks/useRecordCalendarCardMetadataFromPosition';
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

const mockSetRecordCalendarCardHoverPosition = jest.fn();

let mockVisibleRecordFields: RecordField[] = [];
let mockRecordCalendarCardHoverPosition: number | null = null;

const MockRecordInlineCell = () => {
  const { fieldDefinition, onMouseEnter } = useContext(FieldContext);

  return <div onMouseEnter={onMouseEnter}>{fieldDefinition.label}</div>;
};

jest.mock('@/object-record/hooks/useUpdateOneRecord', () => ({
  useUpdateOneRecord: () => ({ updateOneRecord: jest.fn() }),
}));
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
  useSetAtomComponentState: () => mockSetRecordCalendarCardHoverPosition,
}));
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: (state: unknown) => {
      const { recordCalendarCardHoverPositionComponentState } =
        jest.requireActual(
          '@/object-record/record-calendar/record-calendar-card/states/recordCalendarCardHoverPositionComponentState',
        );

      return state === recordCalendarCardHoverPositionComponentState
        ? mockRecordCalendarCardHoverPosition
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

const Wrapper = ({ children }: { children: ReactNode }) => (
  <RecordCalendarContextProvider
    value={{
      viewBarInstanceId: 'opportunities-calendar',
      objectNameSingular: mockOpportunityObjectMetadataItem.nameSingular,
      objectMetadataItem: mockOpportunityObjectMetadataItem,
      objectPermissions: getObjectPermissionsForObject(
        {},
        mockOpportunityObjectMetadataItem.id,
      ),
      visibleRecordFields: mockVisibleRecordFields,
    }}
  >
    {children}
  </RecordCalendarContextProvider>
);

const renderCardBody = () =>
  render(
    <RecordCalendarCardBody
      recordId="opportunity-1"
      calendarDay="2026-11-20"
      isRecordReadOnly={false}
    />,
    { wrapper: Wrapper },
  );

describe('RecordCalendarCardBody', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecordCalendarCardHoverPosition = null;
  });

  it('renders a relation once when a table sub-field column shares its field id', () => {
    mockVisibleRecordFields = [
      nameRecordField,
      companyDomainRecordField,
      companyRecordField,
      stageRecordField,
    ];

    renderCardBody();

    expect(screen.getAllByText(mockCompanyField.label)).toHaveLength(1);
    expect(screen.getByText(mockStageField.label)).toBeInTheDocument();
  });

  it('renders no relation field when only its sub-field column is visible', () => {
    mockVisibleRecordFields = [
      nameRecordField,
      companyDomainRecordField,
      stageRecordField,
    ];

    renderCardBody();

    expect(screen.queryByText(mockCompanyField.label)).not.toBeInTheDocument();
    expect(screen.getByText(mockStageField.label)).toBeInTheDocument();
  });

  it('hovers the field under the cursor, after a skipped sub-field column', async () => {
    mockVisibleRecordFields = [
      nameRecordField,
      companyDomainRecordField,
      stageRecordField,
    ];

    renderCardBody();

    await userEvent.hover(screen.getByText(mockStageField.label));

    mockRecordCalendarCardHoverPosition =
      mockSetRecordCalendarCardHoverPosition.mock.lastCall?.[0] ?? null;

    const { result } = renderHook(
      () => useRecordCalendarCardMetadataFromPosition(),
      { wrapper: Wrapper },
    );

    expect(result.current.hoveredFieldMetadataItem?.id).toBe(mockStageField.id);
  });
});
