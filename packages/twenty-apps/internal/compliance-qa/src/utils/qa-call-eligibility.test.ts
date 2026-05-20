import { afterEach, describe, expect, it } from 'vitest';

import { isCallEligibleForComplianceQa } from 'src/utils/qa-call-eligibility';
import { type SourceCall } from 'src/utils/records';

const buildCall = (overrides: Partial<SourceCall> = {}): SourceCall => ({
  id: 'call-id',
  duration: 600,
  statusName: 'Sale - ACA Only',
  ...overrides,
});

describe('Compliance QA call eligibility', () => {
  afterEach(() => {
    delete process.env.COMPLIANCE_QA_ALLOWED_STATUS_NAMES;
    delete process.env.COMPLIANCE_QA_MIN_DURATION_SECONDS;
  });

  it('allows sale dispositions by default', () => {
    const result = isCallEligibleForComplianceQa(buildCall());

    expect(result.eligible).toBe(true);
  });

  it('skips non-sale dispositions by default', () => {
    const result = isCallEligibleForComplianceQa(
      buildCall({ statusName: 'Customer Service Call' }),
    );

    expect(result).toEqual({
      eligible: false,
      reason:
        'Call status name "Customer Service Call" is not enabled for Compliance QA',
    });
  });

  it('allows admins to opt status-name filtering open with a wildcard', () => {
    process.env.COMPLIANCE_QA_ALLOWED_STATUS_NAMES = '*';

    const result = isCallEligibleForComplianceQa(
      buildCall({ statusName: 'Customer Service Call' }),
    );

    expect(result.eligible).toBe(true);
  });
});
