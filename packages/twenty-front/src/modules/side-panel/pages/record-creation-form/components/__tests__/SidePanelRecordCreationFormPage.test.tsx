import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { i18n } from '@lingui/core';
import { isNonEmptyString } from '@sniptt/guards';
import { I18nProvider } from '@lingui/react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider as JotaiProvider } from 'jotai';
import { type createElement, type Fragment, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { metadataStoreState } from '@/metadata-store/states/metadataStoreState';
import { SidePanelRecordCreationFormPage } from '@/side-panel/pages/record-creation-form/components/SidePanelRecordCreationFormPage';
import { recordCreationFormRequestComponentState } from '@/side-panel/pages/record-creation-form/states/recordCreationFormRequestComponentState';
import { SidePanelPageComponentInstanceContext } from '@/side-panel/states/contexts/SidePanelPageComponentInstanceContext';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { type ValidationRule } from '@/validation-rules/types/ValidationRule';
import { type ValidationRuleViolation } from '@/validation-rules/types/ValidationRuleViolation';
import {
  FieldMetadataType,
  PageLayoutTabLayoutMode,
  PageLayoutType,
  WidgetConfigurationType,
  WidgetType,
} from '~/generated-metadata/graphql';

const REQUEST_ID = 'creation-request';
const OBJECT_METADATA_ID = 'company-object';
const PAGE_LAYOUT_ID = 'company-record-form';
const PAGE_LAYOUT_TAB_ID = 'company-record-form-fields';

const buildTextField = (name: string, label: string) => ({
  id: `field-${name}`,
  universalIdentifier: `field-${name}`,
  name,
  label,
  type: FieldMetadataType.TEXT,
  icon: 'IconAbc',
  isActive: true,
  isSystem: false,
  isUIEditable: true,
  isNullable: true,
  settings: null,
});

const NAME_FIELD = buildTextField('name', 'Name');
const DOMAIN_FIELD = buildTextField('domain', 'Domain');
const NICKNAME_FIELD = buildTextField('nickname', 'Nickname');
const SECRET_FIELD = buildTextField('secret', 'Secret');
const INTERNAL_NOTE_FIELD = buildTextField('internalNote', 'Internal note');

const COMPANY_OBJECT = {
  id: OBJECT_METADATA_ID,
  nameSingular: 'company',
  namePlural: 'companies',
  labelSingular: 'Company',
  labelPlural: 'Companies',
  fields: [
    NAME_FIELD,
    DOMAIN_FIELD,
    NICKNAME_FIELD,
    SECRET_FIELD,
    INTERNAL_NOTE_FIELD,
  ],
};

const NICKNAME_RULE: ValidationRule = {
  id: 'nickname-rule',
  objectMetadataId: OBJECT_METADATA_ID,
  name: 'Nickname is required',
  description: null,
  icon: null,
  errorFieldMetadataId: NICKNAME_FIELD.id,
  expression: 'isNonEmptyString(nickname)',
  message: 'A company needs a nickname',
  isActive: true,
};

const settleRecordCreationDraft = jest.fn();

const buildValidationRuleViolationError = (fieldMetadataId: string) =>
  new CombinedGraphQLErrors({
    data: null,
    errors: [
      {
        message: 'A company needs a nickname',
        extensions: {
          subCode: 'VALIDATION_RULE_VIOLATION',
          validationRuleViolations: [
            {
              ruleId: 'nickname-rule',
              message: 'A company needs a nickname',
              fieldMetadataId,
            },
          ],
        },
      },
    ],
  });
let mockValidationRules: ValidationRule[] = [];
const openRecordCreationFormSettingsInSidePanel = jest.fn();
const mockHasPermissionFlag = jest.fn();
const mockEnqueueToast = jest.fn();
const scrollIntoView = jest.fn();

jest.mock('twenty-ui/components/feedback', () => ({
  ...jest.requireActual('twenty-ui/components/feedback'),
  useToast: () => ({ enqueueToast: mockEnqueueToast }),
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItemById', () => ({
  useObjectMetadataItemById: () => ({ objectMetadataItem: COMPANY_OBJECT }),
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({ objectMetadataItems: [COMPANY_OBJECT] }),
}));

jest.mock('@/object-record/hooks/useObjectPermissionsForObject', () => ({
  useObjectPermissionsForObject: () => ({
    unreadableFields: [],
    uneditableFields: ['field-secret', 'field-internalNote'],
  }),
}));

jest.mock(
  '@/object-record/record-form/hooks/useRecordCreationFormSettle',
  () => ({
    useRecordCreationFormSettle: () => ({ settleRecordCreationDraft }),
  }),
);

jest.mock('@/validation-rules/hooks/useValidationRules', () => ({
  useValidationRules: () => ({ validationRules: mockValidationRules }),
}));

jest.mock('@/settings/roles/hooks/useHasPermissionFlag', () => ({
  useHasPermissionFlag: () => mockHasPermissionFlag(),
}));

jest.mock(
  '@/side-panel/hooks/useOpenRecordCreationFormSettingsInSidePanel',
  () => ({
    useOpenRecordCreationFormSettingsInSidePanel: () => ({
      openRecordCreationFormSettingsInSidePanel,
    }),
  }),
);

jest.mock('@/ui/utilities/hotkey/hooks/useHotkeysOnFocusedElement', () => ({
  useHotkeysOnFocusedElement: () => undefined,
}));

// OMNIA-CUSTOM: the Omnia creation-form seams stay inert unless an Omnia case below sets them.
const OMNIA_RECORD_CREATION_FORM_SEAMS_DEFAULTS = {
  applyOmniaRecordCreationDefaults: (draftRecord: Record<string, unknown>) =>
    draftRecord,
  hasRequiredConditions: false,
  computeRequiredConditionViolations: (
    _draftRecord: Record<string, unknown>,
  ): ValidationRuleViolation[] => [],
  computeRelatedRecordRequiredConditionViolations: async (
    _draftRecord: Record<string, unknown>,
  ): Promise<ValidationRuleViolation[]> => [],
};

let mockOmniaRecordCreationFormSeams = {
  ...OMNIA_RECORD_CREATION_FORM_SEAMS_DEFAULTS,
};

jest.mock(
  '@/object-record/record-form/hooks/useOmniaRecordCreationDefaults',
  () => ({
    useOmniaRecordCreationDefaults: () => ({
      applyOmniaRecordCreationDefaults: (
        draftRecord: Record<string, unknown>,
      ) =>
        mockOmniaRecordCreationFormSeams.applyOmniaRecordCreationDefaults(
          draftRecord,
        ),
      agentProfileWorkspaceMemberId: undefined,
    }),
  }),
);

jest.mock(
  '@/object-record/record-form/hooks/useRequiredConditionViolations',
  () => ({
    useRequiredConditionViolations: () => ({
      hasRequiredConditions:
        mockOmniaRecordCreationFormSeams.hasRequiredConditions,
      computeRequiredConditionViolations: (
        draftRecord: Record<string, unknown>,
      ) =>
        mockOmniaRecordCreationFormSeams.computeRequiredConditionViolations(
          draftRecord,
        ),
      computeRelatedRecordRequiredConditionViolations: (
        draftRecord: Record<string, unknown>,
      ) =>
        mockOmniaRecordCreationFormSeams.computeRelatedRecordRequiredConditionViolations(
          draftRecord,
        ),
    }),
  }),
);

jest.mock(
  '@/object-record/record-form/components/RecordFormFieldInputs',
  () => {
    const ReactForMock = require('react') as {
      createElement: typeof createElement;
      Fragment: typeof Fragment;
    };
    const jotaiStoreModuleForMock = require('@/ui/utilities/state/jotai/jotaiStore');
    const {
      recordFieldInputIsFieldInErrorComponentState: errorStateForMock,
    } = require('@/object-record/record-field/ui/states/recordFieldInputIsFieldInErrorComponentState');
    const {
      getRecordFormFieldInputInstanceId: getInstanceIdForMock,
    } = require('@/object-record/record-form/utils/getRecordFormFieldInputInstanceId');

    return {
      RecordFormFieldInputs: ({
        fieldMetadataItems,
        draftRecord,
        validationRuleViolationsByFieldMetadataId = {},
        onFieldValueChange,
        formInstanceId,
      }: {
        fieldMetadataItems: { id: string; name: string; label: string }[];
        draftRecord: Record<string, unknown>;
        validationRuleViolationsByFieldMetadataId?: Record<
          string,
          { ruleId: string; message: string }[]
        >;
        onFieldValueChange: (gqlFieldName: string, value: string) => void;
        formInstanceId: string;
      }) =>
        ReactForMock.createElement(
          ReactForMock.Fragment,
          null,
          fieldMetadataItems.map((fieldMetadataItem) =>
            ReactForMock.createElement(
              'div',
              {
                key: fieldMetadataItem.id,
                role: 'group',
                'aria-label': `${fieldMetadataItem.label} field`,
              },
              ReactForMock.createElement('input', {
                'aria-label': fieldMetadataItem.label,
                value: (draftRecord[fieldMetadataItem.name] as string) ?? '',
                onChange: (event: { target: { value: string } }) => {
                  onFieldValueChange(
                    fieldMetadataItem.name,
                    event.target.value,
                  );
                  jotaiStoreModuleForMock.jotaiStore.set(
                    errorStateForMock.atomFamily({
                      instanceId: getInstanceIdForMock({
                        formInstanceId,
                        fieldMetadataId: fieldMetadataItem.id,
                      }),
                    }),
                    event.target.value === 'invalid',
                  );
                },
              }),
              (
                validationRuleViolationsByFieldMetadataId[
                  fieldMetadataItem.id
                ] ?? []
              ).map((violation) =>
                ReactForMock.createElement(
                  'div',
                  { key: violation.ruleId, role: 'alert' },
                  violation.message,
                ),
              ),
            ),
          ),
        ),
    };
  },
);

const buildFormFieldWidget = (
  fieldMetadataId: string,
  index: number,
  isActive: boolean,
) => ({
  id: `widget-${fieldMetadataId}`,
  pageLayoutTabId: PAGE_LAYOUT_TAB_ID,
  title: '',
  type: WidgetType.FORM_FIELD,
  isActive,
  position: {
    __typename: 'PageLayoutWidgetVerticalListPosition',
    layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
    index,
  },
  configuration: {
    configurationType: WidgetConfigurationType.FORM_FIELD,
    fieldMetadataId,
  },
});

const seedRecordFormPageLayout = () => {
  jotaiStore.set(metadataStoreState.atomFamily('pageLayouts'), {
    current: [
      {
        id: PAGE_LAYOUT_ID,
        type: PageLayoutType.RECORD_FORM,
        objectMetadataId: OBJECT_METADATA_ID,
        isSystemSideEffect: true,
      },
    ],
    draft: [],
    status: 'up-to-date',
  });
  jotaiStore.set(metadataStoreState.atomFamily('pageLayoutTabs'), {
    current: [
      {
        id: PAGE_LAYOUT_TAB_ID,
        pageLayoutId: PAGE_LAYOUT_ID,
        isActive: true,
        position: 0,
        layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      },
    ],
    draft: [],
    status: 'up-to-date',
  });
  jotaiStore.set(metadataStoreState.atomFamily('pageLayoutWidgets'), {
    current: [
      buildFormFieldWidget(NAME_FIELD.id, 0, true),
      buildFormFieldWidget(DOMAIN_FIELD.id, 1, true),
      buildFormFieldWidget(NICKNAME_FIELD.id, 2, false),
      buildFormFieldWidget(SECRET_FIELD.id, 3, false),
      buildFormFieldWidget(INTERNAL_NOTE_FIELD.id, 4, true),
    ],
    draft: [],
    status: 'up-to-date',
  });
};

const Wrapper = ({ children }: { children: ReactNode }) => (
  <JotaiProvider store={jotaiStore}>
    <I18nProvider i18n={i18n}>
      <SidePanelPageComponentInstanceContext.Provider
        value={{ instanceId: REQUEST_ID }}
      >
        <MemoryRouter>{children}</MemoryRouter>
      </SidePanelPageComponentInstanceContext.Provider>
    </I18nProvider>
  </JotaiProvider>
);

const renderPage = () =>
  render(<SidePanelRecordCreationFormPage />, { wrapper: Wrapper });

describe('SidePanelRecordCreationFormPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Element.prototype.scrollIntoView = scrollIntoView;
    resetJotaiStore();
    mockValidationRules = [];
    settleRecordCreationDraft.mockResolvedValue({});
    mockHasPermissionFlag.mockReturnValue(true);
    seedRecordFormPageLayout();
    jotaiStore.set(
      recordCreationFormRequestComponentState.atomFamily({
        instanceId: REQUEST_ID,
      }),
      {
        requestId: REQUEST_ID,
        objectMetadataId: OBJECT_METADATA_ID,
        initialDraftRecord: {},
        canCreateAnother: true,
      },
    );
  });

  it('shows the visible fields the user can update', () => {
    renderPage();

    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Domain')).toBeInTheDocument();
    expect(screen.queryByLabelText('Internal note')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nickname')).not.toBeInTheDocument();
  });

  it('reveals the hidden fields the user can update on demand', async () => {
    const user = userEvent.setup();

    renderPage();

    await user.click(screen.getByRole('button', { name: 'All fields (3)' }));

    expect(screen.getByLabelText('Nickname')).toBeInTheDocument();
    expect(screen.queryByLabelText('Secret')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hide fields' }));

    expect(screen.queryByLabelText('Nickname')).not.toBeInTheDocument();
  });

  it('submits a value typed in a hidden field after collapsing it', async () => {
    const user = userEvent.setup();

    renderPage();

    await user.click(screen.getByRole('button', { name: 'All fields (3)' }));
    await user.type(screen.getByLabelText('Nickname'), 'Apple');
    await user.click(screen.getByRole('button', { name: 'Hide fields' }));
    await user.click(screen.getByTestId('record-creation-form-create-button'));

    expect(settleRecordCreationDraft).toHaveBeenCalledTimes(1);
    expect(settleRecordCreationDraft).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      draftRecord: { nickname: 'Apple' },
      shouldKeepOpen: false,
    });
  });

  it('restores the draft and revealed fields when the form is shown again', async () => {
    const user = userEvent.setup();

    const { unmount } = renderPage();

    await user.type(screen.getByLabelText('Name'), 'Apple');
    await user.click(screen.getByRole('button', { name: 'All fields (3)' }));
    await user.type(screen.getByLabelText('Nickname'), 'Big Apple');

    unmount();
    renderPage();

    expect(screen.getByLabelText('Name')).toHaveValue('Apple');
    expect(screen.getByLabelText('Nickname')).toHaveValue('Big Apple');
  });

  it('reveals a hidden field targeted by a validation error and shows the message under it', async () => {
    const user = userEvent.setup();

    mockValidationRules = [NICKNAME_RULE];

    renderPage();

    await user.click(screen.getByTestId('record-creation-form-create-button'));

    const nicknameAlert = within(
      screen.getByRole('group', { name: 'Nickname field' }),
    ).getByRole('alert');

    expect(nicknameAlert).toHaveTextContent('A company needs a nickname');
    expect(screen.getByLabelText('Nickname')).toBeInTheDocument();
    expect(settleRecordCreationDraft).not.toHaveBeenCalled();
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
    expect(scrollIntoView.mock.contexts[0]).toBe(nicknameAlert);
  });

  it('keeps hidden fields collapsed and shows a validation error on the whole record below the fields', async () => {
    const user = userEvent.setup();

    mockValidationRules = [{ ...NICKNAME_RULE, errorFieldMetadataId: null }];

    renderPage();

    await user.click(screen.getByTestId('record-creation-form-create-button'));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'A company needs a nickname',
    );
    expect(screen.getByRole('alert').closest('[role="group"]')).toBeNull();
    expect(screen.queryByLabelText('Nickname')).not.toBeInTheDocument();
  });

  it('reveals a hidden field the server rejected through a validation rule and shows the message under it', async () => {
    const user = userEvent.setup();

    settleRecordCreationDraft.mockResolvedValue({
      error: buildValidationRuleViolationError(NICKNAME_FIELD.id),
    });

    renderPage();

    await user.click(screen.getByTestId('record-creation-form-create-button'));

    expect(settleRecordCreationDraft).toHaveBeenCalledTimes(1);
    expect(settleRecordCreationDraft).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      draftRecord: {},
      shouldKeepOpen: false,
    });
    expect(screen.getByLabelText('Nickname')).toBeInTheDocument();

    const nicknameAlert = within(
      screen.getByRole('group', { name: 'Nickname field' }),
    ).getByRole('alert');

    expect(nicknameAlert).toHaveTextContent('A company needs a nickname');
    expect(mockEnqueueToast).not.toHaveBeenCalled();
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
    expect(scrollIntoView.mock.contexts[0]).toBe(nicknameAlert);
  });

  it('keeps a message from the server under its field while the user edits, until the next create', async () => {
    const user = userEvent.setup();

    settleRecordCreationDraft.mockResolvedValueOnce({
      error: buildValidationRuleViolationError(NAME_FIELD.id),
    });

    renderPage();

    await user.click(screen.getByTestId('record-creation-form-create-button'));
    await user.type(screen.getByLabelText('Domain'), 'apple.com');

    expect(
      within(screen.getByRole('group', { name: 'Name field' })).getByRole(
        'alert',
      ),
    ).toHaveTextContent('A company needs a nickname');

    await user.click(screen.getByTestId('record-creation-form-create-button'));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a server error that is not a validation rule violation as a toast', async () => {
    const user = userEvent.setup();

    settleRecordCreationDraft.mockResolvedValue({
      error: new Error('Network error'),
    });

    renderPage();

    await user.click(screen.getByTestId('record-creation-form-create-button'));

    expect(mockEnqueueToast).toHaveBeenCalledTimes(1);
    expect(mockEnqueueToast).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', children: 'Network error' }),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps hidden fields collapsed when the server rejects a visible field', async () => {
    const user = userEvent.setup();

    settleRecordCreationDraft.mockResolvedValue({
      error: buildValidationRuleViolationError(NAME_FIELD.id),
    });

    renderPage();

    await user.click(screen.getByTestId('record-creation-form-create-button'));

    expect(settleRecordCreationDraft).toHaveBeenCalledTimes(1);
    expect(settleRecordCreationDraft).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      draftRecord: {},
      shouldKeepOpen: false,
    });
    expect(screen.queryByLabelText('Nickname')).not.toBeInTheDocument();
  });

  it('opens the form configuration from the options menu for members allowed to edit layouts', async () => {
    const user = userEvent.setup();

    renderPage();

    await user.click(screen.getByRole('button', { name: 'Options' }));
    await user.click(
      await screen.findByRole('menuitem', { name: 'Edit form' }),
    );

    expect(openRecordCreationFormSettingsInSidePanel).toHaveBeenCalledWith(
      COMPANY_OBJECT,
    );
  });

  it('leaves the form configuration out of the options menu for members without the layouts permission', async () => {
    const user = userEvent.setup();

    mockHasPermissionFlag.mockReturnValue(false);

    renderPage();

    await user.click(screen.getByRole('button', { name: 'Options' }));

    expect(
      await screen.findByRole('menuitem', { name: /Create another/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Edit form' }),
    ).not.toBeInTheDocument();
  });

  it('leaves Create another out of the options menu when the request allows a single record', async () => {
    const user = userEvent.setup();

    jotaiStore.set(
      recordCreationFormRequestComponentState.atomFamily({
        instanceId: REQUEST_ID,
      }),
      {
        requestId: REQUEST_ID,
        objectMetadataId: OBJECT_METADATA_ID,
        initialDraftRecord: {},
        canCreateAnother: false,
      },
    );

    renderPage();

    await user.click(screen.getByRole('button', { name: 'Options' }));

    expect(
      await screen.findByRole('menuitem', { name: 'Edit form' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: /Create another/ }),
    ).not.toBeInTheDocument();
  });

  it('hides the options menu when the request allows a single record and the member cannot edit layouts', () => {
    mockHasPermissionFlag.mockReturnValue(false);
    jotaiStore.set(
      recordCreationFormRequestComponentState.atomFamily({
        instanceId: REQUEST_ID,
      }),
      {
        requestId: REQUEST_ID,
        objectMetadataId: OBJECT_METADATA_ID,
        initialDraftRecord: {},
        canCreateAnother: false,
      },
    );

    renderPage();

    expect(
      screen.queryByRole('button', { name: 'Options' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId('record-creation-form-create-button'),
    ).toBeInTheDocument();
  });

  it('creates another record from the options menu and keeps an empty form open', async () => {
    const user = userEvent.setup();

    renderPage();

    await user.type(screen.getByLabelText('Name'), 'Apple');
    await user.click(screen.getByRole('button', { name: 'Options' }));
    await user.click(
      await screen.findByRole('menuitem', { name: /Create another/ }),
    );

    expect(settleRecordCreationDraft).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      draftRecord: { name: 'Apple' },
      shouldKeepOpen: true,
    });
    expect(await screen.findByLabelText('Name')).toHaveValue('');
    expect(mockEnqueueToast).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'success' }),
    );
  });

  it('collapses the hidden fields again after creating another record', async () => {
    const user = userEvent.setup();

    renderPage();

    await user.click(screen.getByRole('button', { name: 'All fields (3)' }));
    await user.click(screen.getByRole('button', { name: 'Options' }));
    await user.click(
      await screen.findByRole('menuitem', { name: /Create another/ }),
    );

    expect(
      await screen.findByRole('button', { name: 'All fields (3)' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Hide fields' }),
    ).not.toBeInTheDocument();
  });

  it('does not submit when a field input reports a validation error', async () => {
    const user = userEvent.setup();

    renderPage();

    await user.type(screen.getByLabelText('Name'), 'invalid');
    await user.click(screen.getByTestId('record-creation-form-create-button'));

    expect(settleRecordCreationDraft).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Valid Name');
    await user.click(screen.getByTestId('record-creation-form-create-button'));

    expect(settleRecordCreationDraft).toHaveBeenCalledTimes(1);
    expect(settleRecordCreationDraft).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      draftRecord: { name: 'Valid Name' },
      shouldKeepOpen: false,
    });
  });

  it('stops blocking creation once a hidden field with an input error is collapsed and shown again', async () => {
    const user = userEvent.setup();

    renderPage();

    await user.click(screen.getByRole('button', { name: 'All fields (3)' }));
    await user.type(screen.getByLabelText('Nickname'), 'invalid');
    await user.click(screen.getByRole('button', { name: 'Hide fields' }));
    await user.click(screen.getByRole('button', { name: 'All fields (3)' }));
    await user.click(screen.getByTestId('record-creation-form-create-button'));

    expect(settleRecordCreationDraft).toHaveBeenCalledTimes(1);
  });

  // OMNIA-CUSTOM: Agent prefill and requiredCondition wiring of the creation form.
  describe('with the Omnia creation form seams', () => {
    afterEach(() => {
      mockOmniaRecordCreationFormSeams = {
        ...OMNIA_RECORD_CREATION_FORM_SEAMS_DEFAULTS,
      };
    });

    it('blocks Create with a requiredCondition message under its field even without validation rules', async () => {
      const user = userEvent.setup();

      mockOmniaRecordCreationFormSeams.hasRequiredConditions = true;
      mockOmniaRecordCreationFormSeams.computeRequiredConditionViolations = (
        draftRecord,
      ) =>
        isNonEmptyString(draftRecord.name)
          ? []
          : [
              {
                ruleId: `required-condition:${NAME_FIELD.id}`,
                fieldMetadataId: NAME_FIELD.id,
                message: 'Name is required',
              },
            ];

      renderPage();

      await user.click(
        screen.getByTestId('record-creation-form-create-button'),
      );

      expect(
        within(screen.getByRole('group', { name: 'Name field' })).getByRole(
          'alert',
        ),
      ).toHaveTextContent('Name is required');
      expect(settleRecordCreationDraft).not.toHaveBeenCalled();

      await user.type(screen.getByLabelText('Name'), 'Apple');

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      await user.click(
        screen.getByTestId('record-creation-form-create-button'),
      );

      expect(settleRecordCreationDraft).toHaveBeenCalledWith({
        requestId: REQUEST_ID,
        draftRecord: { name: 'Apple' },
        shouldKeepOpen: false,
      });
    });

    it('blocks Create while a linked record misses its required fields, until the next Create', async () => {
      const user = userEvent.setup();
      const computeRelatedRecordRequiredConditionViolations = jest
        .fn()
        .mockResolvedValueOnce([
          {
            ruleId: 'required-condition:lead:date-of-birth',
            fieldMetadataId: null,
            message:
              'Lead: Date of Birth is required. Open the lead to complete it.',
          },
        ])
        .mockResolvedValueOnce([]);

      mockOmniaRecordCreationFormSeams.computeRelatedRecordRequiredConditionViolations =
        computeRelatedRecordRequiredConditionViolations;

      renderPage();

      await user.type(screen.getByLabelText('Name'), 'Apple');
      await user.click(
        screen.getByTestId('record-creation-form-create-button'),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Lead: Date of Birth is required. Open the lead to complete it.',
      );
      expect(
        computeRelatedRecordRequiredConditionViolations,
      ).toHaveBeenCalledWith({ name: 'Apple' });
      expect(settleRecordCreationDraft).not.toHaveBeenCalled();

      await user.type(screen.getByLabelText('Domain'), 'apple.com');

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Lead: Date of Birth is required. Open the lead to complete it.',
      );

      await user.click(
        screen.getByTestId('record-creation-form-create-button'),
      );

      expect(settleRecordCreationDraft).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('prefills the Omnia defaults and applies them again after Create another', async () => {
      const user = userEvent.setup();

      mockOmniaRecordCreationFormSeams.applyOmniaRecordCreationDefaults = (
        draftRecord,
      ) =>
        'domain' in draftRecord
          ? draftRecord
          : { ...draftRecord, domain: 'omnia.example' };

      renderPage();

      expect(screen.getByLabelText('Domain')).toHaveValue('omnia.example');

      await user.type(screen.getByLabelText('Name'), 'Apple');
      await user.click(screen.getByRole('button', { name: 'Options' }));
      await user.click(
        await screen.findByRole('menuitem', { name: /Create another/ }),
      );

      expect(settleRecordCreationDraft).toHaveBeenCalledWith({
        requestId: REQUEST_ID,
        draftRecord: { domain: 'omnia.example', name: 'Apple' },
        shouldKeepOpen: true,
      });
      expect(await screen.findByLabelText('Name')).toHaveValue('');
      expect(screen.getByLabelText('Domain')).toHaveValue('omnia.example');
    });
  });
});
