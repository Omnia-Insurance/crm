import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { ObjectOptionsDropdownRelationSubFieldsContent } from '@/object-record/object-options-dropdown/components/ObjectOptionsDropdownRelationSubFieldsContent';
import { ObjectOptionsDropdownContext } from '@/object-record/object-options-dropdown/states/contexts/ObjectOptionsDropdownContext';
import { type RecordField } from '@/object-record/record-field/types/RecordField';
import { ViewFieldsHiddenDropdownSection } from '@/views/components/ViewFieldsHiddenDropdownSection';
import { ViewFieldsSearchDropdownSection } from '@/views/components/ViewFieldsSearchDropdownSection';
import { ViewFieldsVisibleDropdownSection } from '@/views/components/ViewFieldsVisibleDropdownSection';
import { ViewType } from '@/views/types/ViewType';
import { FieldMetadataType, RelationType } from '~/generated-metadata/graphql';

const mockChangeRecordFieldVisibility = jest.fn();
const mockHandleBoardFieldVisibilityChange = jest.fn();
const mockHandleReorderBoardFields = jest.fn();
const mockProcessOptionDropdownDragEnd = jest.fn();
const mockOnContentChange = jest.fn();
const mockSetExpandedRelationFieldId = jest.fn();

let mockExpandedRelationFieldId: string | null = null;
let mockCurrentRecordFields: RecordField[] = [];
let mockVisibleRecordFields: RecordField[] = [];

const buildField = (
  overrides: Partial<FieldMetadataItem> &
    Pick<FieldMetadataItem, 'id' | 'name' | 'label' | 'type'>,
): FieldMetadataItem =>
  ({
    icon: 'IconAbc',
    isActive: true,
    isSystem: false,
    isNullable: true,
    isCustom: false,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }) as FieldMetadataItem;

const relationTo = (
  type: RelationType,
  targetObject: { id: string; nameSingular: string },
) => ({
  type,
  sourceFieldMetadata: { id: 'source', name: 'source' },
  targetFieldMetadata: { id: 'target', name: 'target' },
  sourceObjectMetadata: {
    id: 'source-object',
    nameSingular: 'source',
    namePlural: 'sources',
  },
  targetObjectMetadata: {
    ...targetObject,
    namePlural: `${targetObject.nameSingular}s`,
  },
});

const leadRelationField = buildField({
  id: 'lead-field',
  name: 'lead',
  label: 'Lead',
  type: FieldMetadataType.RELATION,
  relation: relationTo(RelationType.MANY_TO_ONE, {
    id: 'lead-object',
    nameSingular: 'lead',
  }),
});
const productRelationField = buildField({
  id: 'product-field',
  name: 'product',
  label: 'Product',
  type: FieldMetadataType.RELATION,
  relation: relationTo(RelationType.MANY_TO_ONE, {
    id: 'product-object',
    nameSingular: 'product',
  }),
});
const statusField = buildField({
  id: 'status-field',
  name: 'status',
  label: 'Status',
  type: FieldMetadataType.SELECT,
});
const policyNameField = buildField({
  id: 'policy-name-field',
  name: 'name',
  label: 'Name',
  type: FieldMetadataType.TEXT,
});

const policyFields = [
  policyNameField,
  leadRelationField,
  productRelationField,
  statusField,
];

const policyObject = {
  id: 'policy-object',
  nameSingular: 'policy',
  namePlural: 'policies',
  labelIdentifierFieldMetadataId: policyNameField.id,
  fields: policyFields,
  readableFields: policyFields,
  updatableFields: policyFields,
} as unknown as EnrichedObjectMetadataItem;

const leadFirstNameField = buildField({
  id: 'lead-first-name',
  name: 'firstName',
  label: 'First name',
  type: FieldMetadataType.TEXT,
});
const leadDateOfBirthField = buildField({
  id: 'lead-dob',
  name: 'dateOfBirth',
  label: 'Date of Birth',
  type: FieldMetadataType.DATE,
});
const leadCreatedAtField = buildField({
  id: 'lead-created-at',
  name: 'createdAt',
  label: 'Creation date',
  type: FieldMetadataType.DATE_TIME,
  isSystem: true,
});
const leadPoliciesBackReferenceField = buildField({
  id: 'lead-policies',
  name: 'policies',
  label: 'Policies',
  type: FieldMetadataType.RELATION,
  relation: relationTo(RelationType.ONE_TO_MANY, {
    id: 'policy-object',
    nameSingular: 'policy',
  }),
});
const leadCallsField = buildField({
  id: 'lead-calls',
  name: 'calls',
  label: 'Calls',
  type: FieldMetadataType.RELATION,
  relation: relationTo(RelationType.ONE_TO_MANY, {
    id: 'call-object',
    nameSingular: 'call',
  }),
});
const leadInactiveField = buildField({
  id: 'lead-inactive',
  name: 'legacyCode',
  label: 'Legacy code',
  type: FieldMetadataType.TEXT,
  isActive: false,
});
const leadRawJsonField = buildField({
  id: 'lead-raw-json',
  name: 'payload',
  label: 'Payload',
  type: FieldMetadataType.RAW_JSON,
});
const leadUnreadableSsnField = buildField({
  id: 'lead-ssn',
  name: 'ssn',
  label: 'SSN',
  type: FieldMetadataType.TEXT,
});

const leadReadableFields = [
  leadFirstNameField,
  leadDateOfBirthField,
  leadCreatedAtField,
  leadPoliciesBackReferenceField,
  leadCallsField,
  leadInactiveField,
  leadRawJsonField,
];

const leadObject = {
  id: 'lead-object',
  nameSingular: 'lead',
  namePlural: 'leads',
  labelIdentifierFieldMetadataId: leadFirstNameField.id,
  fields: [...leadReadableFields, leadUnreadableSsnField],
  readableFields: leadReadableFields,
  updatableFields: leadReadableFields,
} as unknown as EnrichedObjectMetadataItem;

const recordField = (
  overrides: Partial<RecordField> &
    Pick<RecordField, 'id' | 'fieldMetadataItemId'>,
): RecordField => ({
  isVisible: true,
  position: 0,
  size: 100,
  ...overrides,
});

jest.mock(
  '@/object-record/object-options-dropdown/hooks/useObjectOptionsDropdown',
  () => ({
    useObjectOptionsDropdown: () => ({
      objectMetadataItem: policyObject,
      recordIndexId: 'policies-index',
      onContentChange: mockOnContentChange,
    }),
  }),
);
jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: [policyObject, leadObject],
  }),
}));
jest.mock(
  '@/object-record/record-field/hooks/useChangeRecordFieldVisibility',
  () => ({
    useChangeRecordFieldVisibility: () => ({
      changeRecordFieldVisibility: mockChangeRecordFieldVisibility,
    }),
  }),
);
jest.mock(
  '@/object-record/object-options-dropdown/hooks/useObjectOptionsForBoard',
  () => ({
    useObjectOptionsForBoard: () => ({
      handleBoardFieldVisibilityChange: mockHandleBoardFieldVisibilityChange,
      handleReorderBoardFields: mockHandleReorderBoardFields,
    }),
  }),
);
jest.mock(
  '@/object-record/object-options-dropdown/hooks/useProcessOptionDropdownDragEnd',
  () => ({
    useProcessOptionDropdownDragEnd: () => ({
      processOptionDropdownDragEnd: mockProcessOptionDropdownDragEnd,
    }),
  }),
);
jest.mock('@/object-metadata/hooks/useGetFieldMetadataItemById', () => ({
  useGetFieldMetadataItemByIdOrThrow: () => ({
    getFieldMetadataItemByIdOrThrow: (fieldMetadataItemId: string) => ({
      fieldMetadataItem: [...policyFields].find(
        (field) => field.id === fieldMetadataItemId,
      ),
    }),
  }),
}));
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  () => ({
    useAtomComponentStateValue: (state: unknown) => {
      const { objectOptionsDropdownExpandedRelationFieldIdComponentState } =
        jest.requireActual(
          '@/object-record/object-options-dropdown/states/objectOptionsDropdownExpandedRelationFieldIdComponentState',
        );

      return state ===
        objectOptionsDropdownExpandedRelationFieldIdComponentState
        ? mockExpandedRelationFieldId
        : mockCurrentRecordFields;
    },
  }),
);
jest.mock(
  '@/ui/utilities/state/jotai/hooks/useAtomComponentSelectorValue',
  () => ({
    useAtomComponentSelectorValue: () => mockVisibleRecordFields,
  }),
);
jest.mock('@/ui/utilities/state/jotai/hooks/useSetAtomComponentState', () => ({
  useSetAtomComponentState: () => mockSetExpandedRelationFieldId,
}));
jest.mock('@/applications/components/ApplicationStackIcon', () => ({
  ApplicationStackIcon: () => null,
}));
jest.mock('twenty-ui/icon/provider', () => ({
  ...jest.requireActual('twenty-ui/icon/provider'),
  useIcons: () => ({ getIcon: () => () => null }),
}));
jest.mock('@/ui/layout/dropdown/components/LegacyDropdownContent', () => ({
  LegacyDropdownContent: ({ children }: { children: ReactNode }) => children,
}));
jest.mock(
  '@/ui/layout/dropdown/components/DropdownMenuHeader/DropdownMenuHeader',
  () => ({
    DropdownMenuHeader: ({
      StartComponent,
      children,
    }: {
      StartComponent?: ReactNode;
      children: ReactNode;
    }) => (
      <div>
        {StartComponent}
        <h2>{children}</h2>
      </div>
    ),
  }),
);
jest.mock(
  '@/ui/layout/dropdown/components/DropdownMenuHeader/internal/DropdownMenuHeaderLeftComponent',
  () => ({
    DropdownMenuHeaderLeftComponent: ({
      onClick,
    }: {
      onClick?: () => void;
    }) => (
      <button type="button" onClick={onClick}>
        Back
      </button>
    ),
  }),
);
jest.mock('@/ui/layout/dropdown/components/DropdownMenuItemsContainer', () => ({
  DropdownMenuItemsContainer: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.mock('@/ui/layout/draggable-list/components/DraggableList', () => ({
  DraggableList: ({ draggableItems }: { draggableItems: ReactNode }) => (
    <div>{draggableItems}</div>
  ),
}));
jest.mock('@/ui/layout/draggable-list/components/DraggableItem', () => ({
  DraggableItem: ({
    itemComponent,
    draggableId,
  }: {
    itemComponent: ReactNode;
    draggableId: string;
  }) => <div data-draggable-id={draggableId}>{itemComponent}</div>,
}));
jest.mock('@/ui/layout/draggable-list/components/DraggableListRow', () => ({
  DraggableListRow: ({
    children,
    actions,
  }: {
    children: ReactNode;
    actions?: ReactNode;
  }) => (
    <div role="listitem">
      <span>{children}</span>
      {actions}
    </div>
  ),
}));

const renderInOptionsDropdown = (viewType: ViewType, children: ReactNode) =>
  render(
    <ObjectOptionsDropdownContext.Provider
      value={{
        recordIndexId: 'policies-index',
        objectMetadataItem: policyObject,
        viewType,
        currentContentId: 'hiddenFields',
        onContentChange: mockOnContentChange,
        resetContent: jest.fn(),
        dropdownId: 'options',
      }}
    >
      {children}
    </ObjectOptionsDropdownContext.Provider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockExpandedRelationFieldId = null;
  mockCurrentRecordFields = [];
  mockVisibleRecordFields = [];
});

describe('ObjectOptionsDropdownRelationSubFieldsContent', () => {
  beforeEach(() => {
    mockExpandedRelationFieldId = leadRelationField.id;
    mockCurrentRecordFields = [
      recordField({
        id: 'record-field-lead-dob',
        fieldMetadataItemId: leadRelationField.id,
        subFieldName: 'dateOfBirth',
      }),
      recordField({
        id: 'record-field-lead-first-name',
        fieldMetadataItemId: leadRelationField.id,
        subFieldName: 'firstName',
        isVisible: false,
      }),
    ];
  });

  it('lists only readable, active, displayable target fields that are not columns yet', () => {
    render(<ObjectOptionsDropdownRelationSubFieldsContent />);

    expect(screen.getByRole('heading', { name: 'Lead' })).toBeInTheDocument();
    expect(screen.getByText('First name')).toBeInTheDocument();
    expect(screen.getByText('Calls')).toBeInTheDocument();
    for (const excludedLabel of [
      'Date of Birth',
      'Creation date',
      'Policies',
      'Legacy code',
      'Payload',
      'SSN',
    ]) {
      expect(screen.queryByText(excludedLabel)).not.toBeInTheDocument();
    }
  });

  it('adds the sub-field column by its (relation, sub-field) pair', async () => {
    const user = userEvent.setup();
    render(<ObjectOptionsDropdownRelationSubFieldsContent />);

    const showButtons = screen.getAllByRole('button', { name: 'Show field' });
    await user.click(showButtons[0]);

    expect(mockChangeRecordFieldVisibility).toHaveBeenCalledWith({
      fieldMetadataId: leadRelationField.id,
      isVisible: true,
      subFieldName: 'firstName',
    });
  });

  it('goes back to the hidden fields page', async () => {
    const user = userEvent.setup();
    render(<ObjectOptionsDropdownRelationSubFieldsContent />);

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(mockOnContentChange).toHaveBeenCalledWith('hiddenFields');
  });

  it('shows an empty row when the relation cannot be resolved', () => {
    mockExpandedRelationFieldId = 'unknown-field';
    render(<ObjectOptionsDropdownRelationSubFieldsContent />);

    expect(screen.getByText('No fields available')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Show field' }),
    ).not.toBeInTheDocument();
  });
});

describe('ViewFieldsHiddenDropdownSection', () => {
  beforeEach(() => {
    mockCurrentRecordFields = [
      recordField({ id: 'rf-name', fieldMetadataItemId: policyNameField.id }),
      recordField({ id: 'rf-lead', fieldMetadataItemId: leadRelationField.id }),
      recordField({
        id: 'rf-product-name',
        fieldMetadataItemId: productRelationField.id,
        subFieldName: 'name',
      }),
    ];
  });

  it('on a table, keeps a relation shown only as a sub-field column in the hidden list, with its relation-fields action', async () => {
    const user = userEvent.setup();
    renderInOptionsDropdown(
      ViewType.TABLE,
      <ViewFieldsHiddenDropdownSection />,
    );

    expect(screen.getByText('Product')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Show relation fields' }),
    ).toHaveLength(1);

    await user.click(
      screen.getByRole('button', { name: 'Show relation fields' }),
    );

    expect(mockSetExpandedRelationFieldId).toHaveBeenCalledWith(
      productRelationField.id,
    );
    expect(mockOnContentChange).toHaveBeenCalledWith('relationSubFields');
  });

  it('on a table, opens the sub-fields of a visible relation from its "fields" row', async () => {
    const user = userEvent.setup();
    renderInOptionsDropdown(
      ViewType.TABLE,
      <ViewFieldsHiddenDropdownSection />,
    );

    await user.click(screen.getByRole('button', { name: 'Lead fields' }));

    expect(mockSetExpandedRelationFieldId).toHaveBeenCalledWith(
      leadRelationField.id,
    );
    expect(mockOnContentChange).toHaveBeenCalledWith('relationSubFields');
  });

  it.each([ViewType.KANBAN, ViewType.CALENDAR, ViewType.LIST])(
    'offers no sub-field columns on a %s view',
    (viewType) => {
      renderInOptionsDropdown(viewType, <ViewFieldsHiddenDropdownSection />);

      expect(screen.getByText('Product')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Show relation fields' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Lead fields' }),
      ).not.toBeInTheDocument();
    },
  );
});

describe('ViewFieldsVisibleDropdownSection', () => {
  beforeEach(() => {
    mockVisibleRecordFields = [
      recordField({
        id: 'rf-name',
        fieldMetadataItemId: policyNameField.id,
        position: 0,
      }),
      recordField({
        id: 'rf-lead',
        fieldMetadataItemId: leadRelationField.id,
        position: 1,
      }),
      recordField({
        id: 'rf-lead-dob',
        fieldMetadataItemId: leadRelationField.id,
        subFieldName: 'dateOfBirth',
        position: 2,
      }),
      recordField({
        id: 'rf-lead-ssn',
        fieldMetadataItemId: leadRelationField.id,
        subFieldName: 'ssn',
        position: 3,
      }),
    ];
  });

  it('labels sub-field columns like the table header and keys them by column key', () => {
    const { container } = renderInOptionsDropdown(
      ViewType.TABLE,
      <ViewFieldsVisibleDropdownSection />,
    );

    expect(screen.getByText('Lead / Date of Birth')).toBeInTheDocument();
    expect(screen.getByText('Lead / ssn')).toBeInTheDocument();
    expect(
      [...container.querySelectorAll('[data-draggable-id]')].map((element) =>
        element.getAttribute('data-draggable-id'),
      ),
    ).toEqual(['lead-field', 'lead-field.dateOfBirth', 'lead-field.ssn']);
  });

  it('hides a sub-field column by its pair even on a board view', async () => {
    const user = userEvent.setup();
    renderInOptionsDropdown(
      ViewType.KANBAN,
      <ViewFieldsVisibleDropdownSection />,
    );

    const [, subFieldRow] = screen.getAllByRole('listitem').slice(1);
    const hideButtons = screen.getAllByRole('button', { name: 'Hide field' });

    expect(subFieldRow).toHaveTextContent('Lead / Date of Birth');

    await user.click(hideButtons[1]);
    expect(mockChangeRecordFieldVisibility).toHaveBeenCalledWith({
      fieldMetadataId: leadRelationField.id,
      isVisible: false,
      subFieldName: 'dateOfBirth',
    });
    expect(mockHandleBoardFieldVisibilityChange).not.toHaveBeenCalled();

    await user.click(hideButtons[0]);
    expect(mockHandleBoardFieldVisibilityChange).toHaveBeenCalledWith({
      fieldMetadataId: leadRelationField.id,
      isVisible: false,
    });
  });
});

describe('ViewFieldsSearchDropdownSection', () => {
  it('offers to show a relation whose only visible column is a sub-field column', async () => {
    const user = userEvent.setup();
    mockVisibleRecordFields = [
      recordField({ id: 'rf-name', fieldMetadataItemId: policyNameField.id }),
      recordField({
        id: 'rf-lead-dob',
        fieldMetadataItemId: leadRelationField.id,
        subFieldName: 'dateOfBirth',
      }),
    ];
    renderInOptionsDropdown(
      ViewType.TABLE,
      <ViewFieldsSearchDropdownSection searchInput="lead" />,
    );

    expect(
      screen.queryByRole('button', { name: 'Hide field' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show field' }));

    expect(mockChangeRecordFieldVisibility).toHaveBeenCalledWith({
      fieldMetadataId: leadRelationField.id,
      isVisible: true,
    });
  });

  it('uses the board handler on a board view', async () => {
    const user = userEvent.setup();
    mockVisibleRecordFields = [
      recordField({
        id: 'rf-lead-dob',
        fieldMetadataItemId: leadRelationField.id,
        subFieldName: 'dateOfBirth',
      }),
    ];
    renderInOptionsDropdown(
      ViewType.KANBAN,
      <ViewFieldsSearchDropdownSection searchInput="lead" />,
    );

    await user.click(screen.getByRole('button', { name: 'Show field' }));

    expect(mockHandleBoardFieldVisibilityChange).toHaveBeenCalledWith({
      fieldMetadataId: leadRelationField.id,
      isVisible: true,
    });
    expect(mockChangeRecordFieldVisibility).not.toHaveBeenCalled();
  });

  it('still hides a relation shown as a plain column', async () => {
    const user = userEvent.setup();
    mockVisibleRecordFields = [
      recordField({ id: 'rf-lead', fieldMetadataItemId: leadRelationField.id }),
      recordField({
        id: 'rf-lead-dob',
        fieldMetadataItemId: leadRelationField.id,
        subFieldName: 'dateOfBirth',
      }),
    ];
    renderInOptionsDropdown(
      ViewType.TABLE,
      <ViewFieldsSearchDropdownSection searchInput="lead" />,
    );

    await user.click(screen.getByRole('button', { name: 'Hide field' }));

    expect(mockChangeRecordFieldVisibility).toHaveBeenCalledWith({
      fieldMetadataId: leadRelationField.id,
      isVisible: false,
    });
  });
});
