import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createStore, Provider as JotaiProvider } from 'jotai';

import {
  FieldContext,
  type RecordUpdateHookParams,
} from '@/object-record/record-field/ui/contexts/FieldContext';
import { type FieldDefinition } from '@/object-record/record-field/ui/types/FieldDefinition';
import { type FieldMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { ReconciliationInlineCellDiffValue } from '@/reconciliation/components/ReconciliationInlineCellDiffValue';
import { type FieldDiffOverlay } from '@/reconciliation/types/FieldDiffOverlay';
import { FieldMetadataType } from '~/generated-metadata/graphql';

const RECORD_ID = 'record-id';

const buildFieldDefinition = (
  fieldName: string,
  type: FieldMetadataType,
): FieldDefinition<FieldMetadata> => ({
  fieldMetadataId: `${fieldName}-field-metadata-id`,
  label: fieldName,
  iconName: 'IconText',
  type,
  metadata: { fieldName },
});

const renderDiffValue = ({
  fieldDefinition,
  fieldDiff,
  record,
  isRecordFieldReadOnly = false,
}: {
  fieldDefinition: FieldDefinition<FieldMetadata>;
  fieldDiff: FieldDiffOverlay;
  record: Partial<ObjectRecord>;
  isRecordFieldReadOnly?: boolean;
}) => {
  const updateRecord = jest.fn<void, [RecordUpdateHookParams]>();
  const store = createStore();

  store.set(recordStoreFamilyState.atomFamily(RECORD_ID), {
    __typename: 'Policy',
    id: RECORD_ID,
    ...record,
  });

  render(
    <JotaiProvider store={store}>
      <I18nProvider i18n={i18n}>
        <FieldContext.Provider
          value={{
            recordId: RECORD_ID,
            fieldDefinition,
            isLabelIdentifier: false,
            isRecordFieldReadOnly,
            useUpdateRecord: () => [updateRecord, {}],
          }}
        >
          <ReconciliationInlineCellDiffValue fieldDiff={fieldDiff} />
        </FieldContext.Provider>
      </I18nProvider>
    </JotaiProvider>,
  );

  return { updateRecord };
};

const getUpdateOneRecordInput = (
  updateRecord: jest.Mock<void, [RecordUpdateHookParams]>,
) => updateRecord.mock.calls[0][0].variables.updateOneRecordInput;

describe('ReconciliationInlineCellDiffValue', () => {
  it('should write the carrier value as a number when accepting a NUMBER diff', async () => {
    const { updateRecord } = renderDiffValue({
      fieldDefinition: buildFieldDefinition(
        'applicantCount',
        FieldMetadataType.NUMBER,
      ),
      fieldDiff: { oldValue: '2', newValue: '3', label: 'Applicants' },
      record: { applicantCount: 2 },
    });

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));

    expect(updateRecord).toHaveBeenCalledTimes(1);
    expect(updateRecord.mock.calls[0][0].variables.where).toEqual({
      id: RECORD_ID,
    });
    expect(getUpdateOneRecordInput(updateRecord)).toEqual({
      applicantCount: 3,
    });
  });

  it('should offer Undo once the record holds the carrier value, and write the CRM value back', async () => {
    const { updateRecord } = renderDiffValue({
      fieldDefinition: buildFieldDefinition(
        'applicantCount',
        FieldMetadataType.NUMBER,
      ),
      fieldDiff: { oldValue: '2', newValue: '3', label: 'Applicants' },
      record: { applicantCount: 3 },
    });

    expect(
      screen.queryByRole('button', { name: 'Accept' }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(getUpdateOneRecordInput(updateRecord)).toEqual({
      applicantCount: 2,
    });
  });

  it('should keep the previous primary phone in the additional phones when accepting a phone diff', async () => {
    const { updateRecord } = renderDiffValue({
      fieldDefinition: buildFieldDefinition('phones', FieldMetadataType.PHONES),
      fieldDiff: {
        oldValue: '5551110000',
        newValue: '5552220000',
        label: 'Phone',
        crmFieldPath: 'phones.primaryPhoneNumber',
      },
      record: {
        phones: {
          __typename: 'Phones',
          primaryPhoneNumber: '5551110000',
          primaryPhoneCountryCode: 'US',
          primaryPhoneCallingCode: '+1',
          additionalPhones: null,
        },
      },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));

    expect(getUpdateOneRecordInput(updateRecord)).toEqual({
      phones: {
        primaryPhoneNumber: '5552220000',
        primaryPhoneCountryCode: 'US',
        primaryPhoneCallingCode: '+1',
        additionalPhones: [
          { number: '5551110000', countryCode: 'US', callingCode: '+1' },
        ],
      },
    });
  });

  it('should keep the previous primary email in the additional emails when accepting an email diff', async () => {
    const { updateRecord } = renderDiffValue({
      fieldDefinition: buildFieldDefinition('emails', FieldMetadataType.EMAILS),
      fieldDiff: {
        oldValue: 'old@example.com',
        newValue: 'new@example.com',
        label: 'Email',
        crmFieldPath: 'emails.primaryEmail',
      },
      record: {
        emails: {
          __typename: 'Emails',
          primaryEmail: 'old@example.com',
          additionalEmails: null,
        },
      },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));

    expect(getUpdateOneRecordInput(updateRecord)).toEqual({
      emails: {
        primaryEmail: 'new@example.com',
        additionalEmails: ['old@example.com'],
      },
    });
  });

  it('should clear the field when the carrier value is empty', async () => {
    const { updateRecord } = renderDiffValue({
      fieldDefinition: buildFieldDefinition(
        'policyNumber',
        FieldMetadataType.TEXT,
      ),
      fieldDiff: { oldValue: 'P-100', newValue: null, label: 'Policy number' },
      record: { policyNumber: 'P-100' },
    });

    expect(screen.getByText('Empty')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));

    expect(getUpdateOneRecordInput(updateRecord)).toEqual({
      policyNumber: null,
    });
  });

  it('should not let a reader who cannot edit the field accept the diff', async () => {
    const { updateRecord } = renderDiffValue({
      fieldDefinition: buildFieldDefinition(
        'policyNumber',
        FieldMetadataType.TEXT,
      ),
      fieldDiff: {
        oldValue: 'P-100',
        newValue: 'P-200',
        label: 'Policy number',
      },
      record: { policyNumber: 'P-100' },
      isRecordFieldReadOnly: true,
    });

    const acceptButton = screen.getByRole('button', { name: 'Accept' });

    expect(acceptButton).toBeDisabled();

    await userEvent.click(acceptButton);

    expect(updateRecord).not.toHaveBeenCalled();
  });
});
