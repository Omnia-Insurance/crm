import {
  getMissingRequiredFieldsMessage,
  type MissingRequiredField,
} from '@/object-record/record-side-panel/utils/getMissingRequiredFieldsMessage';

const editable = (
  fieldLabel: string,
  relationLabel?: string,
): MissingRequiredField => ({
  fieldName: fieldLabel,
  fieldLabel,
  relationLabel,
  isReadOnly: false,
  isAgentProfileRelation: false,
});

describe('getMissingRequiredFieldsMessage', () => {
  it('returns null when nothing is missing', () => {
    expect(getMissingRequiredFieldsMessage([])).toBeNull();
  });

  it('names the only missing field', () => {
    expect(getMissingRequiredFieldsMessage([editable('Effective Date')])).toBe(
      'Effective Date is required',
    );
  });

  it('names the first missing field and counts the rest', () => {
    expect(
      getMissingRequiredFieldsMessage([
        editable('Effective Date'),
        editable('Premium'),
        editable('Carrier'),
      ]),
    ).toBe('Effective Date is required (+2 more)');
  });

  it('prefixes fields that live on a related record', () => {
    expect(
      getMissingRequiredFieldsMessage([editable('Date of Birth', 'Lead')]),
    ).toBe('Lead: Date of Birth is required');
  });

  it('leads with an unlinked agent profile over editable fields', () => {
    expect(
      getMissingRequiredFieldsMessage([
        editable('Effective Date'),
        {
          fieldName: 'agent',
          fieldLabel: 'Agent',
          isReadOnly: true,
          isAgentProfileRelation: true,
        },
      ]),
    ).toBe(
      "No agent profile is linked to your account, so Agent can't be filled in. Ask an admin to link one.",
    );
  });

  it('explains other read-only required fields', () => {
    expect(
      getMissingRequiredFieldsMessage([
        {
          fieldName: 'status',
          fieldLabel: 'Status',
          isReadOnly: true,
          isAgentProfileRelation: false,
        },
      ]),
    ).toBe(
      "Status is required, but you don't have permission to edit it. Ask an admin.",
    );
  });
});
