import { getRequiredConditionViolationMessage } from '@/object-record/record-form/utils/getRequiredConditionViolationMessage';

describe('getRequiredConditionViolationMessage', () => {
  it('names the missing field', () => {
    expect(
      getRequiredConditionViolationMessage({
        fieldLabel: 'Effective Date',
        isReadOnly: false,
        isAgentProfileRelation: false,
      }),
    ).toBe('Effective Date is required');
  });

  it('prefixes a field of a linked record and sends the user to that record', () => {
    expect(
      getRequiredConditionViolationMessage({
        fieldLabel: 'Date of Birth',
        relationLabel: 'Lead',
        isReadOnly: false,
        isAgentProfileRelation: false,
      }),
    ).toBe('Lead: Date of Birth is required. Open the lead to complete it.');
  });

  it('explains an agent profile that is not linked to the account', () => {
    expect(
      getRequiredConditionViolationMessage({
        fieldLabel: 'Agent',
        isReadOnly: true,
        isAgentProfileRelation: true,
      }),
    ).toBe(
      "No agent profile is linked to your account, so Agent can't be filled in. Ask an admin to link one.",
    );
  });

  it('explains other required fields the user cannot edit', () => {
    expect(
      getRequiredConditionViolationMessage({
        fieldLabel: 'Status',
        isReadOnly: true,
        isAgentProfileRelation: false,
      }),
    ).toBe(
      "Status is required, but you don't have permission to edit it. Ask an admin.",
    );
  });

  it('explains a field of a linked record the user cannot edit', () => {
    expect(
      getRequiredConditionViolationMessage({
        fieldLabel: 'Date of Birth',
        relationLabel: 'Lead',
        isReadOnly: true,
        isAgentProfileRelation: false,
      }),
    ).toBe(
      "Lead: Date of Birth is required, but you don't have permission to edit it. Ask an admin.",
    );
  });
});
