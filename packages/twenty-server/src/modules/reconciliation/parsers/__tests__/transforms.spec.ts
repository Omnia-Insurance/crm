/**
 * Phase 3 (items 3.16–3.17) + Phase 4 (4.1/4.8) coverage for the live
 * transform stage:
 * - toDateString calendar validation (no fabricated ISO strings)
 * - configurable 2-digit-year pivot (DOBs resolve to 19yy)
 * - ambiguous Excel-serial rejection (4-digit years in date columns)
 * - toNumber/toCurrency accounting negatives
 * - TransformError → parse.job cell-error machinery via transformRows
 * - status-role header validation (required roles fail the run)
 * - the full Ambetter live parse path (real BOB fixtures ported from the
 *   deleted config-driven parser's generic.spec.ts — audit test-gap #5)
 * - per-carrier transform vocabulary via buildTransforms (Phase 4.8)
 */

import { STATUS_ENGINE_ROLE_TYPES } from 'src/modules/reconciliation/engines/status';
import {
  applyComputedFields,
  ArithmeticExprError,
  buildTransforms,
  compileArithmeticExpr,
  COMPUTATION_METHOD_IDS,
  COMPUTATIONS,
  DEFAULT_TRANSFORM_RULES,
  evaluateRowFilterOp,
  inferDataType,
  REQUIRED_STATUS_ENGINE_ROLES,
  resolveFieldMapping,
  resolveTwoDigitYear,
  ROW_FILTER_OPS,
  rowFilterRuleProblems,
  toBoolean,
  toCurrency,
  toDateString,
  toNumber,
  TransformError,
  TRANSFORMS,
  transformRows,
  TWO_DIGIT_YEAR_FUTURE_WINDOW,
  validateComputedFieldParams,
  validateStatusRoleMapping,
  type RowFilterRule,
} from 'src/modules/reconciliation/parsers/transforms';
import type {
  ColumnMapping,
  ComputedFieldDef,
} from 'src/modules/reconciliation/types/reconciliation';

describe('TransformError', () => {
  it('carries reason and raw value', () => {
    const error = new TransformError('Bad value', '31/12/2025');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('TransformError');
    expect(error.reason).toBe('Bad value');
    expect(error.raw).toBe('31/12/2025');
    expect(error.message).toContain('31/12/2025');
  });
});

describe('toDateString', () => {
  describe('empty input', () => {
    it.each([null, undefined, ''])('returns null for %p', (value) => {
      expect(toDateString(value)).toBeNull();
    });

    it('returns null for whitespace-only strings', () => {
      expect(toDateString('   ')).toBeNull();
    });
  });

  describe('valid formats', () => {
    it('parses M/D/YYYY (real Ambetter values)', () => {
      expect(toDateString('2/1/2026')).toBe('2026-02-01');
      expect(toDateString('12/30/1963')).toBe('1963-12-30');
      expect(toDateString('8/31/2021')).toBe('2021-08-31');
    });

    it('passes through valid YYYY-MM-DD', () => {
      expect(toDateString('2026-01-31')).toBe('2026-01-31');
    });

    it('accepts leap day in a leap year', () => {
      expect(toDateString('2/29/2024')).toBe('2024-02-29');
      expect(toDateString('2024-02-29')).toBe('2024-02-29');
    });

    it('formats UTC-midnight Date objects without timezone shift', () => {
      expect(toDateString(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01');
    });
  });

  describe('invalid calendar dates produce parse errors, not fabricated ISO strings', () => {
    it('rejects DD/MM-style input (month out of range)', () => {
      // Previously fabricated '2025-31-12'
      expect(() => toDateString('31/12/2025')).toThrow(TransformError);
      expect(() => toDateString('31/12/2025')).toThrow(/Invalid month\/day/);
    });

    it('rejects day out of range for the month', () => {
      expect(() => toDateString('2/30/2026')).toThrow(TransformError);
      expect(() => toDateString('4/31/2026')).toThrow(TransformError);
    });

    it('rejects leap day in a non-leap year', () => {
      expect(() => toDateString('2/29/2023')).toThrow(TransformError);
    });

    it('rejects zero month/day', () => {
      expect(() => toDateString('0/15/2026')).toThrow(TransformError);
      expect(() => toDateString('1/0/2026')).toThrow(TransformError);
    });

    it('validates the YYYY-MM-DD fast path too', () => {
      expect(() => toDateString('2025-31-12')).toThrow(TransformError);
      expect(() => toDateString('2025-02-30')).toThrow(TransformError);
    });

    it('rejects unrecognized text formats instead of returning null', () => {
      expect(() => toDateString('Jan 1, 2026')).toThrow(TransformError);
      expect(() => toDateString('N/A')).toThrow(TransformError);
    });

    it('rejects invalid Date objects', () => {
      expect(() => toDateString(new Date('nonsense'))).toThrow(TransformError);
    });
  });

  describe('two-digit-year pivot', () => {
    it('resolves a 1963 DOB to 19yy, not 2063', () => {
      // Audit case: '12/30/63' must not become 2063-12-30
      expect(toDateString('12/30/63')).toBe('1963-12-30');
    });

    it('resolves near-future years to 20yy', () => {
      expect(toDateString('1/1/26')).toBe('2026-01-01');
    });

    it('pivots at currentYear-2000 + TWO_DIGIT_YEAR_FUTURE_WINDOW', () => {
      // Deterministic via the explicit currentYear parameter
      const pivot = 2026 - 2000 + TWO_DIGIT_YEAR_FUTURE_WINDOW; // 36

      expect(resolveTwoDigitYear(pivot, 2026)).toBe(2000 + pivot); // '36' → 2036
      expect(resolveTwoDigitYear(pivot + 1, 2026)).toBe(1900 + pivot + 1); // '37' → 1937
      expect(resolveTwoDigitYear(63, 2026)).toBe(1963);
      expect(resolveTwoDigitYear(0, 2026)).toBe(2000);
      expect(resolveTwoDigitYear(99, 2026)).toBe(1999);
    });

    it('still calendar-validates pivoted dates', () => {
      expect(() => toDateString('2/30/63')).toThrow(TransformError);
    });
  });

  describe('Excel serial decoding', () => {
    it('decodes numeric-cell serials (typeof number = numeric XLSX cell)', () => {
      expect(toDateString(44197)).toBe('2021-01-01');
      expect(toDateString(46054)).toBe('2026-02-01');
    });

    it('decodes digit-string serials outside the ambiguous year window (CSV limitation)', () => {
      expect(toDateString('44197')).toBe('2021-01-01');
    });

    it('rejects 4-digit integers 1900-2100 as ambiguous years — string and number', () => {
      // '2026' reads as a year AND as serial 1905-07-18; never guess.
      expect(() => toDateString('2026')).toThrow(/Ambiguous numeric date/);
      expect(() => toDateString(2026)).toThrow(/Ambiguous numeric date/);
      expect(() => toDateString('1900')).toThrow(TransformError);
      expect(() => toDateString(2100)).toThrow(TransformError);
    });

    it('rejects serials decoding to implausible years', () => {
      expect(() => toDateString(80000)).toThrow(/implausible year/); // → 2119
      expect(() => toDateString(-1)).toThrow(/implausible year/); // → 1899
    });
  });
});

describe('toNumber / toCurrency', () => {
  it.each([null, undefined, ''])('returns null for %p', (value) => {
    expect(toNumber(value)).toBeNull();
    expect(toCurrency(value)).toBeNull();
  });

  it('parses plain and formatted values', () => {
    expect(toNumber('42')).toBe(42);
    expect(toCurrency('$1,234.56')).toBe(1234.56);
    expect(toCurrency(42.5)).toBe(42.5);
  });

  it('parses accounting-style parenthesized negatives', () => {
    expect(toCurrency('(123.45)')).toBe(-123.45);
    expect(toCurrency('$(1,234.56)')).toBe(-1234.56);
    expect(toNumber('(7)')).toBe(-7);
  });

  it('parses trailing-minus negatives', () => {
    expect(toCurrency('123.45-')).toBe(-123.45);
    expect(toNumber('7-')).toBe(-7);
  });

  it('still parses leading-minus negatives', () => {
    expect(toCurrency('-123.45')).toBe(-123.45);
  });

  it('throws TransformError on unparseable non-empty input', () => {
    expect(() => toNumber('abc')).toThrow(TransformError);
    expect(() => toCurrency('12.3.4')).toThrow(TransformError);
    expect(() => toCurrency('$')).toThrow(TransformError);
    expect(() => toCurrency('-')).toThrow(TransformError);
    expect(() => toNumber(NaN)).toThrow(TransformError);
  });
});

describe('toBoolean', () => {
  it('parses recognized tokens', () => {
    expect(toBoolean('Yes')).toBe(true);
    expect(toBoolean('TRUE')).toBe(true);
    expect(toBoolean('1')).toBe(true);
    expect(toBoolean('No')).toBe(false);
    expect(toBoolean('false')).toBe(false);
    expect(toBoolean('0')).toBe(false);
    expect(toBoolean(true)).toBe(true);
  });

  it('returns null for empty input', () => {
    expect(toBoolean(null)).toBeNull();
    expect(toBoolean('')).toBeNull();
  });

  it('throws TransformError on unrecognized non-empty input', () => {
    expect(() => toBoolean('maybe')).toThrow(TransformError);
  });
});

describe('transformRows (live parse stage)', () => {
  const headerTypes = new Map<string, string>([
    ['Paid Through Date', 'date'],
    ['Member Date Of Birth', 'date'],
    ['Premium', 'currency'],
    ['Eligible for Commission', 'boolean'],
  ]);

  it('transforms valid rows with zero parse errors', () => {
    const { normalized, parseErrors } = transformRows(
      [
        {
          'Policy Number': 'U94753487',
          'Paid Through Date': '8/31/2021',
          'Member Date Of Birth': '12/30/1963',
          Premium: '$1,234.56',
          'Eligible for Commission': 'No',
        },
      ],
      headerTypes,
      null,
      {},
      'Policy Number',
    );

    expect(parseErrors).toHaveLength(0);
    expect(normalized).toHaveLength(1);
    expect(normalized[0]['Paid Through Date']).toBe('2021-08-31');
    expect(normalized[0]['Member Date Of Birth']).toBe('1963-12-30');
    expect(normalized[0].Premium).toBe(1234.56);
    expect(normalized[0]['Eligible for Commission']).toBe(false);
    expect(normalized[0].__rowNumber).toBe(1);
    expect(normalized[0].__name).toBe('U94753487 - row 1');
  });

  it('counts invalid cells in parseErrors and preserves raw values on the row', () => {
    const { normalized, parseErrors } = transformRows(
      [
        {
          'Policy Number': 'U1',
          'Paid Through Date': '31/12/2025', // DD/MM — invalid
          Premium: 'abc', // unparseable
        },
        {
          'Policy Number': 'U2',
          'Paid Through Date': '1/31/2026', // valid
          Premium: '(50.00)', // valid accounting negative
        },
      ],
      headerTypes,
      null,
      {},
      'Policy Number',
    );

    // Both rows survive — bad cells never drop a row
    expect(normalized).toHaveLength(2);

    // Two bad cells in row 1, zero in row 2
    expect(parseErrors).toHaveLength(2);
    expect(parseErrors[0]).toMatchObject({
      rowNumber: 1,
      header: 'Paid Through Date',
    });
    expect(parseErrors[1]).toMatchObject({ rowNumber: 1, header: 'Premium' });

    // Raw values preserved for review
    expect(normalized[0]['Paid Through Date']).toBe('31/12/2025');
    expect(normalized[0].Premium).toBe('abc');

    // Valid row transformed normally
    expect(normalized[1]['Paid Through Date']).toBe('2026-01-31');
    expect(normalized[1].Premium).toBe(-50);
  });

  it('rejects ambiguous 4-digit serial/year strings in date columns', () => {
    const { normalized, parseErrors } = transformRows(
      [{ 'Paid Through Date': '2026' }],
      headerTypes,
      null,
      {},
    );

    expect(parseErrors).toHaveLength(1);
    expect(parseErrors[0].error).toMatch(/Ambiguous numeric date/);
    expect(normalized[0]['Paid Through Date']).toBe('2026');
  });

  it('still applies computed fields when some cells fail', () => {
    const computedFields: ComputedFieldDef[] = [
      {
        outputKey: 'True Effective Date',
        method: 'maxDate',
        inputs: ['Broker Effective Date', 'Policy Effective Date'],
        type: 'date',
      },
    ];

    const types = new Map<string, string>([
      ['Broker Effective Date', 'date'],
      ['Policy Effective Date', 'date'],
      ['Paid Through Date', 'date'],
    ]);

    const { normalized, parseErrors } = transformRows(
      [
        {
          'Broker Effective Date': '2/1/2026',
          'Policy Effective Date': '4/1/2021',
          'Paid Through Date': 'garbage',
        },
      ],
      types,
      computedFields,
      {},
    );

    expect(parseErrors).toHaveLength(1);
    expect(normalized[0]['True Effective Date']).toBe('2026-02-01');
  });

  it('TRANSFORMS registry covers all FieldDataTypes used by inferDataType', () => {
    expect(Object.keys(TRANSFORMS).sort()).toEqual([
      'boolean',
      'currency',
      'date',
      'number',
      'text',
    ]);
  });
});

describe('validateStatusRoleMapping (status-role header validation)', () => {
  const actualHeaders = [
    'Policy Number',
    'Broker Effective Date',
    'Policy Effective Date',
    'Paid Through Date',
    'Policy Term Date',
    'Eligible for Commission',
  ];

  const computedFields: ComputedFieldDef[] = [
    {
      outputKey: 'True Effective Date',
      method: 'maxDate',
      inputs: ['Broker Effective Date', 'Policy Effective Date'],
      type: 'date',
    },
  ];

  it('declares effectiveDate and paidThroughDate as required (load-bearing in status.ts)', () => {
    expect(REQUIRED_STATUS_ENGINE_ROLES).toEqual([
      'effectiveDate',
      'paidThroughDate',
    ]);
  });

  it('passes when every role resolves to a header or computed output key', () => {
    const result = validateStatusRoleMapping(
      {
        effectiveDate: 'True Effective Date', // computed output key
        paidThroughDate: 'Paid Through Date', // real header
        termDate: 'Policy Term Date',
        eligibleForCommission: 'Eligible for Commission',
      },
      actualHeaders,
      computedFields,
    );

    expect(result.unresolvedRequired).toHaveLength(0);
    expect(result.unresolvedOptional).toHaveLength(0);
  });

  it('flags a required role whose header matches nothing (carrier renamed the column)', () => {
    const resolved = resolveFieldMapping(
      {
        effectiveDate: 'True Effective Date',
        paidThroughDate: 'Paid Through Date',
        termDate: 'Policy Term Date',
      },
      // File renamed 'Paid Through Date' → 'Paid Thru'
      ['Policy Number', 'Paid Thru', 'Policy Term Date'],
    );

    const result = validateStatusRoleMapping(
      resolved,
      ['Policy Number', 'Paid Thru', 'Policy Term Date'],
      computedFields,
    );

    expect(result.unresolvedRequired).toEqual([
      { role: 'paidThroughDate', configuredHeader: 'Paid Through Date' },
    ]);
    expect(result.unresolvedOptional).toHaveLength(0);
  });

  it('flags optional roles separately (warn, not fail)', () => {
    const result = validateStatusRoleMapping(
      {
        effectiveDate: 'True Effective Date',
        paidThroughDate: 'Paid Through Date',
        termDate: 'Term Dt', // not in file, not computed
      },
      actualHeaders,
      computedFields,
    );

    expect(result.unresolvedRequired).toHaveLength(0);
    expect(result.unresolvedOptional).toEqual([
      { role: 'termDate', configuredHeader: 'Term Dt' },
    ]);
  });

  it('handles null computedFields', () => {
    const result = validateStatusRoleMapping(
      { effectiveDate: 'True Effective Date' },
      actualHeaders,
      null,
    );

    expect(result.unresolvedRequired).toEqual([
      { role: 'effectiveDate', configuredHeader: 'True Effective Date' },
    ]);
  });

  it('resolves underscore-format headers via resolveFieldMapping before validation', () => {
    const underscoreHeaders = ['policy_number', 'paid_through_date'];
    const resolved = resolveFieldMapping(
      { paidThroughDate: 'Paid Through Date' },
      underscoreHeaders,
    );

    const result = validateStatusRoleMapping(resolved, underscoreHeaders, null);

    expect(resolved.paidThroughDate).toBe('paid_through_date');
    expect(result.unresolvedRequired).toHaveLength(0);
  });

  describe('required-role PRESENCE (per-engine, multi-carrier audit 2026-06-11)', () => {
    it('flags required roles absent from the mapping entirely (the blanket-status hole)', () => {
      // A config that simply OMITS the paidThroughDate mapping used to pass
      // validation and blanket-derive PAYMENT_ERROR_* for the active book.
      const result = validateStatusRoleMapping(
        { effectiveDate: 'True Effective Date' },
        actualHeaders,
        computedFields,
      );

      expect(result.missingRequired).toEqual(['paidThroughDate']);
      expect(result.unresolvedRequired).toHaveLength(0);
    });

    it('missing and unresolved are disjoint buckets', () => {
      // effectiveDate is mapped but resolves to nothing; paidThroughDate is
      // not mapped at all.
      const result = validateStatusRoleMapping(
        { effectiveDate: 'Nonexistent Header' },
        actualHeaders,
        null,
      );

      expect(result.unresolvedRequired).toEqual([
        { role: 'effectiveDate', configuredHeader: 'Nonexistent Header' },
      ]);
      expect(result.missingRequired).toEqual(['paidThroughDate']);
    });

    it('needs no file headers to detect presence (empty-file case)', () => {
      const result = validateStatusRoleMapping({}, [], null);

      expect(result.missingRequired).toEqual([
        'effectiveDate',
        'paidThroughDate',
      ]);
    });

    it('takes the required-role set from the engine, not the global default', () => {
      // An explicit-status passthrough engine that requires only its status
      // column: omitting paidThroughDate must NOT flag for it.
      const result = validateStatusRoleMapping(
        { carrierStatus: 'Carrier Status' },
        ['Carrier Status'],
        null,
        ['carrierStatus'],
      );

      expect(result.missingRequired).toHaveLength(0);
      expect(result.unresolvedRequired).toHaveLength(0);
      expect(result.unresolvedOptional).toHaveLength(0);

      // …and a missing required role is reported under the engine's own
      // vocabulary.
      const missing = validateStatusRoleMapping(
        { effectiveDate: 'True Effective Date' },
        actualHeaders,
        computedFields,
        ['carrierStatus'],
      );

      expect(missing.missingRequired).toEqual(['carrierStatus']);
      // effectiveDate is not required for this engine → optional bucket
      // would only flag it if unresolved (it resolves, so nothing flags).
      expect(missing.unresolvedRequired).toHaveLength(0);
    });

    it('defaults to the deprecated Ambetter-tuned global when no roles are passed', () => {
      const result = validateStatusRoleMapping(
        {
          effectiveDate: 'True Effective Date',
          paidThroughDate: 'Paid Through Date',
        },
        actualHeaders,
        computedFields,
      );

      expect(result.missingRequired).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Ambetter live parse path (Phase 4.1 — fixtures ported from the deleted
// generic.spec.ts, which tested the dead parseGenericBob stack). This drives
// the exact pipeline parse.job runs: resolveFieldMapping → headerTypes
// (columnMapping fieldType + STATUS_ENGINE_ROLE_TYPES) → transformRows
// (per-cell transforms + applyComputedFields). Keys in the output are file
// HEADERS (the live model), not the dead stack's canonical field names.
// ---------------------------------------------------------------------------

describe('Ambetter live parse path (ported real-BOB fixtures)', () => {
  // Live ColumnMappingEntry shape, mirroring what the import dialog captures
  // and what the seed command pre-fills (seed-ambetter-carrier-config).
  const ambetterColumnMapping: ColumnMapping = {
    'Policy Number': {
      crmField: 'policyNumber',
      fieldType: 'TEXT',
      fieldKey: 'policyNumber',
    },
    'Insured First Name': {
      crmField: 'lead.name.firstName',
      fieldType: 'FULL_NAME',
      fieldKey: 'update:firstName-name (lead)',
    },
    'Insured Last Name': {
      crmField: 'lead.name.lastName',
      fieldType: 'FULL_NAME',
      fieldKey: 'update:lastName-name (lead)',
    },
    'Member Date Of Birth': {
      crmField: 'lead.dateOfBirth',
      fieldType: 'DATE',
      fieldKey: 'update:dateOfBirth (lead)',
    },
    'Broker Name': {
      crmField: 'agent.name',
      fieldType: 'TEXT',
      fieldKey: 'update:name (agent)',
    },
    'Paid Through Date': {
      crmField: 'paidThroughDate',
      fieldType: 'DATE',
      fieldKey: 'paidThroughDate',
    },
    'Monthly Premium Amount': {
      crmField: 'premium.amountMicros',
      fieldType: 'CURRENCY',
      fieldKey: 'Amount (premium)',
    },
    'Member Phone Number': {
      crmField: 'lead.phones.primaryPhoneNumber',
      fieldType: 'PHONES',
      fieldKey: 'update:primaryPhoneNumber-phones (lead)',
    },
    'Member Email': {
      crmField: 'lead.emails.primaryEmail',
      fieldType: 'EMAILS',
      fieldKey: 'update:primaryEmail-emails (lead)',
    },
  };

  // As seeded on carrierConfig.fieldConfig: inputs are status ROLE names,
  // resolved to headers through statusFieldMapping at run time.
  const ambetterComputedFields: ComputedFieldDef[] = [
    {
      outputKey: 'True Effective Date',
      method: 'maxDate',
      inputs: ['brokerEffectiveDate', 'policyEffectiveDate'],
      type: 'date',
      crmField: 'effectiveDate',
    },
  ];

  // As seeded on statusConfig.fieldMapping (canonical title-case headers).
  const ambetterStatusFieldMapping: Record<string, string> = {
    effectiveDate: 'True Effective Date',
    paidThroughDate: 'Paid Through Date',
    termDate: 'Policy Term Date',
    eligibleForCommission: 'Eligible for Commission',
    brokerEffectiveDate: 'Broker Effective Date',
    policyEffectiveDate: 'Policy Effective Date',
  };

  // Real Ambetter BOB rows from the 03/10/2026 export (title-case headers).
  const REAL_ROWS = [
    {
      'Broker Name': 'Alexandria Marrero',
      'Broker NPN': '21340394',
      'Policy Number': 'U94753487',
      'Plan Name': 'Ambetter Balanced Care 12 (2021) + Vision + Adult Dental',
      'Insured First Name': 'Sara',
      'Insured Last Name': 'Ghoston',
      'Broker Effective Date': '2/1/2026',
      'Policy Effective Date': '4/1/2021',
      'Policy Term Date': '8/31/2021',
      'Paid Through Date': '8/31/2021',
      'Member Date Of Birth': '12/30/1963',
      'Eligible for Commission': 'No',
      'Member Phone Number': '2149953244',
      'Member Email': 'ghostonsara8@gmail.com',
    },
    {
      'Broker Name': 'Alexandria Marrero',
      'Broker NPN': '21340394',
      'Policy Number': 'U71951365',
      'Plan Name': 'Everyday Bronze',
      'Insured First Name': 'Brittany',
      'Insured Last Name': 'Smith',
      'Broker Effective Date': '1/1/2026',
      'Policy Effective Date': '6/1/2024',
      'Policy Term Date': '12/31/2026',
      'Paid Through Date': '12/31/2026',
      'Member Date Of Birth': '6/4/1985',
      'Eligible for Commission': 'Yes',
      'Member Phone Number': '',
      'Member Email': '',
    },
    {
      'Broker Name': 'Alexandria Marrero',
      'Broker NPN': '21340394',
      'Policy Number': 'U73500709',
      'Plan Name': 'Everyday Bronze',
      'Insured First Name': 'Jeremy',
      'Insured Last Name': 'Boudreaux',
      'Broker Effective Date': '1/1/2026',
      'Policy Effective Date': '1/1/2026',
      'Policy Term Date': '12/31/2026',
      'Paid Through Date': '1/31/2026',
      'Member Date Of Birth': '2/10/1988',
      'Eligible for Commission': 'Yes',
      'Member Phone Number': '9853340462',
      'Member Email': 'boudreauxjeremy40@gmail.com',
    },
  ];

  /** Mirror parse.job's headerTypes assembly exactly. */
  const buildHeaderTypes = (
    columnMapping: ColumnMapping,
    statusFieldMapping: Record<string, string>,
  ): Map<string, string> => {
    const headerTypes = new Map<string, string>();

    for (const [header, entry] of Object.entries(columnMapping)) {
      headerTypes.set(header, inferDataType(entry.fieldType));
    }
    for (const [role, header] of Object.entries(statusFieldMapping)) {
      if (!headerTypes.has(header) && STATUS_ENGINE_ROLE_TYPES[role]) {
        headerTypes.set(header, STATUS_ENGINE_ROLE_TYPES[role]);
      }
    }

    return headerTypes;
  };

  /** Mirror parse.job's full transform stage for a set of raw rows. */
  const runLivePath = (
    rawRows: Record<string, unknown>[],
    columnMapping: ColumnMapping = ambetterColumnMapping,
  ) => {
    const actualHeaders = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
    const statusFieldMapping = resolveFieldMapping(
      ambetterStatusFieldMapping,
      actualHeaders,
    );
    const roleValidation = validateStatusRoleMapping(
      statusFieldMapping,
      actualHeaders,
      ambetterComputedFields,
    );
    const headerTypes = buildHeaderTypes(columnMapping, statusFieldMapping);
    const policyNumberHeader = Object.entries(columnMapping).find(
      ([, e]) => e.crmField === 'policyNumber',
    )?.[0];

    return {
      roleValidation,
      statusFieldMapping,
      ...transformRows(
        rawRows,
        headerTypes,
        ambetterComputedFields,
        statusFieldMapping,
        policyNumberHeader,
      ),
    };
  };

  describe('title-case headers (XLSX export format)', () => {
    it('parses all rows with zero parse errors and resolved status roles', () => {
      const { normalized, parseErrors, roleValidation } =
        runLivePath(REAL_ROWS);

      expect(parseErrors).toHaveLength(0);
      expect(normalized).toHaveLength(3);
      expect(roleValidation.unresolvedRequired).toHaveLength(0);
      expect(roleValidation.unresolvedOptional).toHaveLength(0);
    });

    it('applies text transforms', () => {
      const { normalized } = runLivePath(REAL_ROWS);

      expect(normalized[0]['Insured First Name']).toBe('Sara');
      expect(normalized[0]['Insured Last Name']).toBe('Ghoston');
      expect(normalized[0]['Broker Name']).toBe('Alexandria Marrero');
    });

    it('applies date transforms (column-mapped + status-role headers)', () => {
      const { normalized } = runLivePath(REAL_ROWS);

      // Status-role typed (STATUS_ENGINE_ROLE_TYPES)
      expect(normalized[0]['Policy Effective Date']).toBe('2021-04-01');
      expect(normalized[0]['Broker Effective Date']).toBe('2026-02-01');
      // Column-mapping typed (fieldType DATE)
      expect(normalized[0]['Paid Through Date']).toBe('2021-08-31');
      expect(normalized[0]['Member Date Of Birth']).toBe('1963-12-30');
    });

    it('applies boolean transforms', () => {
      const { normalized } = runLivePath(REAL_ROWS);

      expect(normalized[0]['Eligible for Commission']).toBe(false);
      expect(normalized[1]['Eligible for Commission']).toBe(true);
    });

    it('computes True Effective Date via maxDate with role-name inputs', () => {
      const { normalized } = runLivePath(REAL_ROWS);

      // Sara: MAX('2026-02-01', '2021-04-01') = '2026-02-01'
      expect(normalized[0]['True Effective Date']).toBe('2026-02-01');
      // Brittany: MAX('2026-01-01', '2024-06-01') = '2026-01-01'
      expect(normalized[1]['True Effective Date']).toBe('2026-01-01');
      // Jeremy: MAX('2026-01-01', '2026-01-01') = '2026-01-01'
      expect(normalized[2]['True Effective Date']).toBe('2026-01-01');
    });

    it('normalizes missing optional fields to null', () => {
      const { normalized } = runLivePath(REAL_ROWS);

      // Brittany has no phone or email
      expect(normalized[1]['Member Phone Number']).toBeNull();
      expect(normalized[1]['Member Email']).toBeNull();
    });

    it('sets row number and display name metadata', () => {
      const { normalized } = runLivePath(REAL_ROWS);

      expect(normalized[0].__rowNumber).toBe(1);
      expect(normalized[0].__name).toBe('U94753487 - row 1');
      expect(normalized[2].__rowNumber).toBe(3);
      expect(normalized[2].__name).toBe('U73500709 - row 3');
    });

    it('passes unmapped columns through untouched', () => {
      const { normalized } = runLivePath(REAL_ROWS);

      expect(normalized[0]['Plan Name']).toBe(
        'Ambetter Balanced Care 12 (2021) + Vision + Adult Dental',
      );
      expect(normalized[0]['Broker NPN']).toBe('21340394');
    });
  });

  describe('underscore headers (CSV export format)', () => {
    // Same book, exported with underscore headers — resolveFieldMapping must
    // bridge the canonical title-case carrier config to these headers.
    const UNDERSCORE_ROWS = REAL_ROWS.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([header, value]) => [
          header.toLowerCase().replace(/[\s/]+/g, '_'),
          value,
        ]),
      ),
    );

    const underscoreColumnMapping: ColumnMapping = Object.fromEntries(
      Object.entries(ambetterColumnMapping).map(([header, entry]) => [
        header.toLowerCase().replace(/[\s/]+/g, '_'),
        entry,
      ]),
    );

    it('resolves status roles against underscore headers and parses identically', () => {
      const { normalized, parseErrors, statusFieldMapping, roleValidation } =
        runLivePath(UNDERSCORE_ROWS, underscoreColumnMapping);

      expect(parseErrors).toHaveLength(0);
      expect(roleValidation.unresolvedRequired).toHaveLength(0);
      expect(statusFieldMapping.paidThroughDate).toBe('paid_through_date');
      expect(statusFieldMapping.brokerEffectiveDate).toBe(
        'broker_effective_date',
      );
      // effectiveDate maps to the computed output key — kept verbatim
      expect(statusFieldMapping.effectiveDate).toBe('True Effective Date');

      expect(normalized[0].broker_effective_date).toBe('2026-02-01');
      expect(normalized[0].policy_effective_date).toBe('2021-04-01');
      expect(normalized[0].member_date_of_birth).toBe('1963-12-30');
      expect(normalized[0].eligible_for_commission).toBe(false);
      // Computed field inputs resolve through the underscore-resolved mapping
      expect(normalized[0]['True Effective Date']).toBe('2026-02-01');
      expect(normalized[0].__name).toBe('U94753487 - row 1');
    });
  });

  describe('Excel-serial dates (raw XLSX numeric cells)', () => {
    it('decodes serial date cells through the same pipeline', () => {
      const serialRow = {
        ...REAL_ROWS[0],
        'Broker Effective Date': 46054, // 2026-02-01
        'Policy Effective Date': 44287, // 2021-04-01
        'Member Date Of Birth': 23375, // 1963-12-30
      };

      const { normalized, parseErrors } = runLivePath([serialRow]);

      expect(parseErrors).toHaveLength(0);
      expect(normalized[0]['Broker Effective Date']).toBe('2026-02-01');
      expect(normalized[0]['Policy Effective Date']).toBe('2021-04-01');
      expect(normalized[0]['Member Date Of Birth']).toBe('1963-12-30');
      expect(normalized[0]['True Effective Date']).toBe('2026-02-01');
    });
  });

  describe('invalid dates', () => {
    it('records DD/MM-formatted dates as cell parse errors, preserving the row with raw values', () => {
      // The dead generic parser dropped the whole row; the live path keeps
      // the row, preserves the raw cell, and counts the error.
      const badRow = {
        ...REAL_ROWS[0],
        'Member Date Of Birth': '31/12/1963',
      };

      const { normalized, parseErrors } = runLivePath([badRow]);

      expect(normalized).toHaveLength(1);
      expect(parseErrors).toHaveLength(1);
      expect(parseErrors[0]).toMatchObject({
        rowNumber: 1,
        header: 'Member Date Of Birth',
      });
      expect(parseErrors[0].error).toMatch(/Invalid month\/day/);
      expect(normalized[0]['Member Date Of Birth']).toBe('31/12/1963');
    });
  });
});

// ---------------------------------------------------------------------------
// Per-carrier transform vocabulary (Phase 4.8)
// ---------------------------------------------------------------------------

describe('buildTransforms (per-carrier transform rules)', () => {
  describe('dateFormats: DD/MM/YYYY carrier', () => {
    const ddmm = buildTransforms({ dateFormats: ['DD/MM/YYYY'] });

    it('parses 31/12/2025 as December 31', () => {
      expect(ddmm.date('31/12/2025')).toBe('2025-12-31');
      expect(ddmm.date('1/2/2026')).toBe('2026-02-01'); // day 1, month 2
    });

    it('rejects MM/DD-formatted input', () => {
      expect(() => ddmm.date('12/31/2025')).toThrow(TransformError);
      expect(() => ddmm.date('12/31/2025')).toThrow(/expected DD\/MM\/YYYY/);
    });

    it('applies the format to 2-digit years too', () => {
      expect(ddmm.date('31/12/25')).toBe('2025-12-31');
    });

    it('keeps ISO, Excel-serial, and empty handling unchanged', () => {
      expect(ddmm.date('2026-01-31')).toBe('2026-01-31');
      expect(ddmm.date(44197)).toBe('2021-01-01');
      expect(ddmm.date('')).toBeNull();
    });

    it('parses a DD/MM carrier file through transformRows via transformRules', () => {
      const { normalized, parseErrors } = transformRows(
        [{ 'Term Date': '31/12/2025' }],
        new Map([['Term Date', 'date']]),
        null,
        {},
        undefined,
        { dateFormats: ['DD/MM/YYYY'] },
      );

      expect(parseErrors).toHaveLength(0);
      expect(normalized[0]['Term Date']).toBe('2025-12-31');
    });
  });

  describe('dateFormats: multi-format fallback', () => {
    it('tries formats in order, first valid calendar date wins', () => {
      const both = buildTransforms({
        dateFormats: ['MM/DD/YYYY', 'DD/MM/YYYY'],
      });

      // Ambiguous — MM/DD listed first, wins
      expect(both.date('1/2/2026')).toBe('2026-01-02');
      // Invalid as MM/DD (month 31) — falls through to DD/MM
      expect(both.date('31/12/2025')).toBe('2025-12-31');
      // Invalid under both
      expect(() => both.date('31/31/2025')).toThrow(TransformError);
    });
  });

  describe('boolean vocabulary', () => {
    const custom = buildTransforms({
      booleanTrue: ['y', 'active'],
      booleanFalse: ['n', 'termed'],
    });

    it('recognizes the carrier vocabulary case-insensitively', () => {
      expect(custom.boolean('Y')).toBe(true);
      expect(custom.boolean('Active')).toBe(true);
      expect(custom.boolean('N')).toBe(false);
      expect(custom.boolean('TERMED')).toBe(false);
    });

    it('rejects default tokens not in the carrier vocabulary', () => {
      expect(() => custom.boolean('yes')).toThrow(TransformError);
      expect(() => custom.boolean('yes')).toThrow(/Unrecognized boolean/);
    });

    it('keeps native booleans and empties unchanged', () => {
      expect(custom.boolean(true)).toBe(true);
      expect(custom.boolean(null)).toBeNull();
      expect(custom.boolean('')).toBeNull();
    });
  });

  describe('twoDigitYearPivot override', () => {
    it('widens the future window for 2-digit years', () => {
      const wide = buildTransforms({ twoDigitYearPivot: 80 });

      // Default window (10): '99' is far past the pivot → 1999
      expect(TRANSFORMS.date('1/1/99')).toBe('1999-01-01');
      // Window 80: 2099 is within currentYear+80 → 2099
      expect(wide.date('1/1/99')).toBe('2099-01-01');
    });

    it('resolveTwoDigitYear honors an explicit window', () => {
      expect(resolveTwoDigitYear(99, 2026, 80)).toBe(2099);
      expect(resolveTwoDigitYear(99, 2026)).toBe(1999);
      expect(resolveTwoDigitYear(45, 2026, 30)).toBe(2045);
      expect(resolveTwoDigitYear(45, 2026)).toBe(1945);
    });
  });

  describe('currencyStrip override', () => {
    it('strips the configured symbols', () => {
      const pound = buildTransforms({ currencyStrip: ['£', ','] });

      expect(pound.currency('£1,234.56')).toBe(1234.56);
      expect(pound.number('£42')).toBe(42);
      // '$' is no longer stripped → unparseable
      expect(() => pound.currency('$42')).toThrow(TransformError);
    });

    it('escapes regex metacharacters in symbols', () => {
      const weird = buildTransforms({ currencyStrip: ['$', ',', '(USD)'] });

      expect(weird.currency('42.50 (USD)')).toBe(42.5);
    });
  });

  describe('defaults are bit-identical to the historical TRANSFORMS', () => {
    // One probe per behavior branch, reused from fixtures above.
    const PROBES: Record<string, unknown[]> = {
      text: ['  Sara  ', '', null, 42],
      date: [
        '2/1/2026',
        '12/30/1963',
        '8/31/2021',
        '12/30/63',
        '2026-01-31',
        44197,
        46054,
        '44197',
        '31/12/2025',
        '2026',
        'Jan 1, 2026',
        '',
        null,
      ],
      boolean: [
        'Yes',
        'No',
        'TRUE',
        'false',
        '1',
        '0',
        true,
        'maybe',
        '',
        null,
      ],
      number: ['42', '(7)', '7-', 'abc', '', null],
      currency: ['$1,234.56', '(123.45)', '$(1,234.56)', '$', '-', '', null],
    };

    const capture = (fn: (value: unknown) => unknown, value: unknown) => {
      try {
        return { ok: true, value: fn(value) };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    };

    it.each(Object.keys(PROBES))(
      '%s transform matches under {} and DEFAULT_TRANSFORM_RULES',
      (type) => {
        const fromEmpty = buildTransforms({});
        const fromDefaults = buildTransforms(DEFAULT_TRANSFORM_RULES);
        const fromNull = buildTransforms();

        for (const probe of PROBES[type]) {
          const expected = capture(TRANSFORMS[type], probe);

          expect(capture(fromEmpty[type], probe)).toEqual(expected);
          expect(capture(fromDefaults[type], probe)).toEqual(expected);
          expect(capture(fromNull[type], probe)).toEqual(expected);
        }
      },
    );

    it('transformRows output is identical with and without explicit default rules', () => {
      const rows = [
        {
          'Policy Number': 'U94753487',
          'Paid Through Date': '8/31/2021',
          Premium: '$1,234.56',
          'Eligible for Commission': 'No',
        },
      ];
      const headerTypes = new Map<string, string>([
        ['Paid Through Date', 'date'],
        ['Premium', 'currency'],
        ['Eligible for Commission', 'boolean'],
      ]);

      const implicit = transformRows(rows, headerTypes, null, {});
      const explicit = transformRows(
        rows,
        headerTypes,
        null,
        {},
        undefined,
        DEFAULT_TRANSFORM_RULES,
      );

      expect(explicit).toEqual(implicit);
    });
  });
});

// ---------------------------------------------------------------------------
// OMN-12 parse vocabulary: date-format token grammar
// ---------------------------------------------------------------------------

describe('date-format token grammar (OMN-12)', () => {
  const dateWith = (formats: Parameters<typeof buildTransforms>[0]) =>
    buildTransforms(formats).date;

  describe('YYYY/MM/DD', () => {
    const date = dateWith({ dateFormats: ['YYYY/MM/DD'] });

    it('parses zero-padded and unpadded forms', () => {
      expect(date('2026/01/05')).toBe('2026-01-05');
      expect(date('2026/1/5')).toBe('2026-01-05');
    });

    it('calendar-validates (no fabricated dates)', () => {
      expect(() => date('2026/13/05')).toThrow(TransformError);
      expect(() => date('2026/02/30')).toThrow(/Invalid month\/day/);
    });

    it('does not accept US slash dates when not configured', () => {
      expect(() => date('1/5/2026')).toThrow(/Unrecognized date format/);
    });
  });

  describe('MM-DD-YYYY / DD-MM-YYYY (dash numeric)', () => {
    it('parses MM-DD order', () => {
      const date = dateWith({ dateFormats: ['MM-DD-YYYY'] });

      expect(date('01-05-2026')).toBe('2026-01-05');
      expect(date('1-5-2026')).toBe('2026-01-05');
    });

    it('parses DD-MM order', () => {
      const date = dateWith({ dateFormats: ['DD-MM-YYYY'] });

      expect(date('31-12-2025')).toBe('2025-12-31');
    });

    it('tries dash formats in configured order, first valid wins', () => {
      const date = dateWith({ dateFormats: ['MM-DD-YYYY', 'DD-MM-YYYY'] });

      // Ambiguous: MM-DD wins (configured first)
      expect(date('01-05-2026')).toBe('2026-01-05');
      // Month 13 invalid for MM-DD → falls to DD-MM
      expect(date('13-05-2026')).toBe('2026-05-13');
    });

    it('throws when the dash shape matches but no format yields a real date', () => {
      const date = dateWith({ dateFormats: ['MM-DD-YYYY'] });

      expect(() => date('13-45-2026')).toThrow(
        /Invalid month\/day in date "13-45-2026" \(expected MM-DD-YYYY\)/,
      );
    });

    it('resolves 2-digit dash years through the pivot window', () => {
      const date = dateWith({ dateFormats: ['MM-DD-YYYY'] });

      expect(date('12-30-63')).toBe('1963-12-30');
      expect(date('1-5-26')).toBe('2026-01-05');
    });

    it('keeps the strict ISO fast path first (calendar-validated)', () => {
      const date = dateWith({ dateFormats: ['DD-MM-YYYY'] });

      expect(date('2026-01-05')).toBe('2026-01-05');
      // Strict ISO shape with invalid month stays an ISO calendar error,
      // never reinterpreted by the dash tokens.
      expect(() => date('2025-31-12')).toThrow(/Invalid calendar date/);
    });
  });

  describe('YYYY-MM-DD as a configured token (relaxed digits)', () => {
    const date = dateWith({ dateFormats: ['YYYY-MM-DD'] });

    it('parses unpadded month/day (strict ISO is always-on regardless)', () => {
      expect(date('2026-1-5')).toBe('2026-01-05');
      expect(date('2026-01-05')).toBe('2026-01-05');
    });

    it('calendar-validates the relaxed shape', () => {
      expect(() => date('2026-2-30')).toThrow(/Invalid month\/day/);
    });
  });

  describe('MMM D YYYY (written month)', () => {
    const date = dateWith({ dateFormats: ['MMM D YYYY'] });

    it('parses abbreviated month names', () => {
      expect(date('Jan 5 2026')).toBe('2026-01-05');
      expect(date('Dec 31 2025')).toBe('2025-12-31');
    });

    it('is case-insensitive and accepts an optional comma', () => {
      expect(date('JAN 5, 2026')).toBe('2026-01-05');
      expect(date('jan 05 2026')).toBe('2026-01-05');
    });

    it('accepts full month names', () => {
      expect(date('January 5 2026')).toBe('2026-01-05');
      expect(date('September 1 2025')).toBe('2025-09-01');
    });

    it('calendar-validates written dates', () => {
      expect(() => date('Feb 30 2026')).toThrow(/Invalid month\/day/);
      expect(() => date('Jan 32 2026')).toThrow(TransformError);
    });

    it('rejects non-month words as unrecognized, not as invalid dates', () => {
      expect(() => date('Foo 5 2026')).toThrow(/Unrecognized date format/);
    });
  });

  describe('D MMM YYYY (written month, day first)', () => {
    const date = dateWith({ dateFormats: ['D MMM YYYY'] });

    it('parses space and dash separated forms', () => {
      expect(date('5 Jan 2026')).toBe('2026-01-05');
      expect(date('05-JAN-2026')).toBe('2026-01-05');
    });

    it('calendar-validates', () => {
      expect(() => date('31 Feb 2026')).toThrow(/Invalid month\/day/);
    });
  });

  describe('unset-default parity (HARD INVARIANT)', () => {
    it('default rules reject every new-token shape exactly as before', () => {
      for (const probe of [
        '01-05-2026', // dash numeric
        '2026/01/05', // year-first slash
        'Jan 5 2026', // written month
        '05-JAN-2026', // day-first written
      ]) {
        expect(() => toDateString(probe)).toThrow(/Unrecognized date format/);
      }
    });

    it('default slash + ISO + serial behavior is unchanged', () => {
      expect(toDateString('1/5/2026')).toBe('2026-01-05');
      expect(toDateString('12/30/63')).toBe('1963-12-30');
      expect(toDateString('2026-01-05')).toBe('2026-01-05');
      expect(toDateString(44197)).toBe('2021-01-01');
      expect(() => toDateString('31/12/2025')).toThrow(
        /Invalid month\/day in date "31\/12\/2025" \(expected MM\/DD\/YYYY\)/,
      );
      expect(() => toDateString('1/31/26')).not.toThrow();
    });

    it('mixed token lists keep slash interpretation order independent of other shapes', () => {
      const date = dateWith({
        dateFormats: ['MM/DD/YYYY', 'MMM D YYYY', 'DD-MM-YYYY'],
      });

      expect(date('1/5/2026')).toBe('2026-01-05'); // MM/DD
      expect(date('Jan 5 2026')).toBe('2026-01-05');
      expect(date('31-12-2025')).toBe('2025-12-31');
    });
  });
});

// ---------------------------------------------------------------------------
// OMN-12 parse vocabulary: row filters + skipFooterRows
// ---------------------------------------------------------------------------

describe('parseSettings row filters (OMN-12)', () => {
  const headerTypes = new Map<string, string>([['Effective Date', 'date']]);

  const rows = [
    {
      'Policy Number': 'U1',
      'Effective Date': '1/1/2026',
      Premium: '100',
    },
    {
      'Policy Number': '',
      'Effective Date': null,
      Premium: null,
    },
    {
      'Policy Number': 'U2',
      'Effective Date': '2/1/2026',
      Premium: '200',
    },
    {
      'Policy Number': 'Totals',
      'Effective Date': null,
      Premium: '300',
    },
  ];

  it('skips footer "Totals" rows via equals and counts them', () => {
    const { normalized, skippedByRowFilter } = transformRows(
      rows,
      headerTypes,
      null,
      {},
      'Policy Number',
      null,
      {
        rowFilters: [
          {
            column: 'Policy Number',
            op: 'equals',
            value: 'totals',
            action: 'skip',
          },
        ],
      },
    );

    expect(skippedByRowFilter).toBe(1);
    expect(normalized).toHaveLength(3);
    expect(normalized.map((row) => row['Policy Number'])).toEqual([
      'U1',
      '',
      'U2',
    ]);
  });

  it('skips blank separator rows via empty and preserves ORIGINAL row numbering', () => {
    const { normalized, skippedByRowFilter } = transformRows(
      rows,
      headerTypes,
      null,
      {},
      'Policy Number',
      null,
      {
        rowFilters: [{ column: 'Policy Number', op: 'empty', action: 'skip' }],
      },
    );

    expect(skippedByRowFilter).toBe(1);
    expect(normalized.map((row) => row.__rowNumber)).toEqual([1, 3, 4]);
    expect(normalized[1].__name).toBe('U2 - row 3');
  });

  it('skipFooterRows drops the last N rows unconditionally', () => {
    const { normalized, skippedByRowFilter } = transformRows(
      rows,
      headerTypes,
      null,
      {},
      'Policy Number',
      null,
      { skipFooterRows: 2 },
    );

    expect(skippedByRowFilter).toBe(2);
    expect(normalized.map((row) => row['Policy Number'])).toEqual(['U1', '']);
  });

  it('combines rowFilters and skipFooterRows without double counting', () => {
    const { normalized, skippedByRowFilter } = transformRows(
      rows,
      headerTypes,
      null,
      {},
      'Policy Number',
      null,
      {
        skipFooterRows: 1,
        rowFilters: [{ column: 'Policy Number', op: 'empty', action: 'skip' }],
      },
    );

    expect(skippedByRowFilter).toBe(2);
    expect(normalized.map((row) => row['Policy Number'])).toEqual(['U1', 'U2']);
  });

  it('resolves filter columns with header normalization (underscore CSV)', () => {
    const { normalized, skippedByRowFilter } = transformRows(
      [{ policy_number: 'U1' }, { policy_number: 'Subtotal North Region' }],
      new Map(),
      null,
      {},
      undefined,
      null,
      {
        rowFilters: [
          {
            column: 'Policy Number',
            op: 'startsWith',
            value: 'subtotal',
            action: 'skip',
          },
        ],
      },
    );

    expect(skippedByRowFilter).toBe(1);
    expect(normalized).toHaveLength(1);
  });

  it('supports contains and matches ops (case-insensitive)', () => {
    const filterWith = (rule: RowFilterRule) =>
      transformRows(rows, headerTypes, null, {}, 'Policy Number', null, {
        rowFilters: [rule],
      });

    expect(
      filterWith({
        column: 'Policy Number',
        op: 'contains',
        value: 'OTAL',
        action: 'skip',
      }).skippedByRowFilter,
    ).toBe(1);

    expect(
      filterWith({
        column: 'Policy Number',
        op: 'matches',
        value: '^(total|subtotal)',
        action: 'skip',
      }).skippedByRowFilter,
    ).toBe(1);
  });

  it('a column matching no header makes the rule inert (typo safety)', () => {
    const { normalized, skippedByRowFilter } = transformRows(
      rows,
      headerTypes,
      null,
      {},
      'Policy Number',
      null,
      {
        rowFilters: [
          // 'empty' on a missing column would otherwise skip EVERY row
          { column: 'Polcy Nmber', op: 'empty', action: 'skip' },
        ],
      },
    );

    expect(skippedByRowFilter).toBe(0);
    expect(normalized).toHaveLength(rows.length);
  });

  it('unset parseSettings is bit-identical to the historical output', () => {
    const without = transformRows(rows, headerTypes, null, {}, 'Policy Number');
    const withEmpty = transformRows(
      rows,
      headerTypes,
      null,
      {},
      'Policy Number',
      null,
      {},
    );

    expect(without.skippedByRowFilter).toBe(0);
    expect(withEmpty).toEqual(without);
  });
});

describe('evaluateRowFilterOp / rowFilterRuleProblems', () => {
  it('treats null/undefined/whitespace as empty', () => {
    expect(evaluateRowFilterOp(null, 'empty', undefined)).toBe(true);
    expect(evaluateRowFilterOp(undefined, 'empty', undefined)).toBe(true);
    expect(evaluateRowFilterOp('   ', 'empty', undefined)).toBe(true);
    expect(evaluateRowFilterOp('x', 'empty', undefined)).toBe(false);
    expect(evaluateRowFilterOp(0, 'notEmpty', undefined)).toBe(true);
  });

  it('flags value-requiredness per op', () => {
    expect(
      rowFilterRuleProblems({
        column: 'A',
        op: 'equals',
        action: 'skip',
      }),
    ).toEqual([expect.stringContaining('requires a non-empty string "value"')]);

    expect(
      rowFilterRuleProblems({
        column: 'A',
        op: 'empty',
        value: 'x',
        action: 'skip',
      }),
    ).toEqual([expect.stringContaining('takes no "value"')]);

    expect(
      rowFilterRuleProblems({
        column: 'A',
        op: 'contains',
        value: 'x',
        action: 'skip',
      }),
    ).toEqual([]);
  });

  it('flags an uncompilable matches regex', () => {
    expect(
      rowFilterRuleProblems({
        column: 'A',
        op: 'matches',
        value: '(unclosed',
        action: 'skip',
      }),
    ).toEqual([expect.stringContaining('not a valid regular expression')]);
  });
});

// ---------------------------------------------------------------------------
// OMN-12 parse vocabulary: computed-field methods
// ---------------------------------------------------------------------------

describe('computed-field vocabulary (OMN-12)', () => {
  const stubContext = { resolveKey: () => null };

  it('registers exactly the documented method ids', () => {
    expect([...COMPUTATION_METHOD_IDS].sort()).toEqual([
      'arithmetic',
      'coalesce',
      'concat',
      'conditional',
      'firstNonEmpty',
      'maxDate',
      'minDate',
    ]);
  });

  describe('concat', () => {
    it('joins non-empty inputs with the configured separator', () => {
      expect(
        COMPUTATIONS.concat(['John', 'Smith'], {
          ...stubContext,
          params: { separator: ' ' },
        }),
      ).toBe('John Smith');
    });

    it('defaults to no separator and skips null/empty inputs', () => {
      expect(COMPUTATIONS.concat(['A', null, '', '  ', 'B'], stubContext)).toBe(
        'AB',
      );
    });

    it('stringifies numeric inputs', () => {
      expect(
        COMPUTATIONS.concat(['U', 123], { ...stubContext, params: {} }),
      ).toBe('U123');
    });
  });

  describe('firstNonEmpty vs coalesce (honest difference)', () => {
    it('coalesce returns the first non-NULL value — including empty strings', () => {
      expect(COMPUTATIONS.coalesce(['', 'X'], stubContext)).toBe('');
    });

    it('firstNonEmpty skips empty/whitespace strings and trims the winner', () => {
      expect(
        COMPUTATIONS.firstNonEmpty(['', '  ', ' X ', 'Y'], stubContext),
      ).toBe('X');
      expect(COMPUTATIONS.firstNonEmpty([null, false], stubContext)).toBe(
        false,
      );
      expect(COMPUTATIONS.firstNonEmpty(['', '   '], stubContext)).toBeNull();
    });
  });

  describe('conditional (through applyComputedFields)', () => {
    const computedFields: ComputedFieldDef[] = [
      {
        outputKey: 'Effective Source',
        method: 'conditional',
        inputs: ['Broker Effective Date', 'Policy Effective Date'],
        params: {
          if: { column: 'Status', op: 'equals', value: 'active' },
          then: '$1',
          else: '$2',
        },
        type: 'date',
      },
    ];

    it('picks then-ref when the condition matches (case-insensitive)', () => {
      const row: Record<string, unknown> = {
        Status: 'ACTIVE',
        'Broker Effective Date': '2026-02-01',
        'Policy Effective Date': '2021-04-01',
      };

      applyComputedFields(row, computedFields);

      expect(row['Effective Source']).toBe('2026-02-01');
    });

    it('picks else-ref otherwise', () => {
      const row: Record<string, unknown> = {
        Status: 'Termed',
        'Broker Effective Date': '2026-02-01',
        'Policy Effective Date': '2021-04-01',
      };

      applyComputedFields(row, computedFields);

      expect(row['Effective Source']).toBe('2021-04-01');
    });

    it('resolves the if.column through the role fieldMapping like inputs', () => {
      const row: Record<string, unknown> = {
        eligible_flag: 'Yes',
        'Broker Effective Date': '2026-02-01',
        'Policy Effective Date': '2021-04-01',
      };

      applyComputedFields(
        row,
        [
          {
            ...computedFields[0],
            params: {
              if: {
                column: 'eligibleForCommission',
                op: 'equals',
                value: 'yes',
              },
              then: '$1',
              else: '$2',
            },
          },
        ],
        { eligibleForCommission: 'eligible_flag' },
      );

      expect(row['Effective Source']).toBe('2026-02-01');
    });

    it('supports literal then/else branches', () => {
      const row: Record<string, unknown> = {
        Status: 'active',
        'Broker Effective Date': '2026-02-01',
      };

      applyComputedFields(row, [
        {
          outputKey: 'Is Active',
          method: 'conditional',
          inputs: ['Broker Effective Date'],
          params: {
            if: { column: 'Status', op: 'notEmpty' },
            then: true,
            else: false,
          },
          type: 'boolean',
        },
      ]);

      expect(row['Is Active']).toBe(true);
    });
  });

  describe('arithmetic (through applyComputedFields)', () => {
    it('evaluates input refs with precedence and parentheses', () => {
      const row: Record<string, unknown> = {
        'Annual Premium': 1200,
        'Member Count': 2,
      };

      applyComputedFields(row, [
        {
          outputKey: 'Monthly Per Member',
          method: 'arithmetic',
          inputs: ['Annual Premium', 'Member Count'],
          params: { expr: '($1 / 12) / $2' },
          type: 'number',
        },
      ]);

      expect(row['Monthly Per Member']).toBe(50);
    });

    it('coerces numeric strings and yields null on non-numeric input', () => {
      const row: Record<string, unknown> = { A: '100', B: 'garbage' };

      applyComputedFields(row, [
        {
          outputKey: 'Doubled',
          method: 'arithmetic',
          inputs: ['A'],
          params: { expr: '$1 * 2' },
          type: 'number',
        },
        {
          outputKey: 'Broken',
          method: 'arithmetic',
          inputs: ['B'],
          params: { expr: '$1 * 2' },
          type: 'number',
        },
      ]);

      expect(row.Doubled).toBe(200);
      expect(row.Broken).toBeNull();
    });

    it('yields null on division by zero', () => {
      const row: Record<string, unknown> = { A: 10, B: 0 };

      applyComputedFields(row, [
        {
          outputKey: 'Ratio',
          method: 'arithmetic',
          inputs: ['A', 'B'],
          params: { expr: '$1 / $2' },
          type: 'number',
        },
      ]);

      expect(row.Ratio).toBeNull();
    });
  });

  it('skips computation when no inputs resolve (uniform with legacy methods)', () => {
    const row: Record<string, unknown> = { Unrelated: 'x' };

    applyComputedFields(row, [
      {
        outputKey: 'Out',
        method: 'concat',
        inputs: ['Missing A', 'Missing B'],
        type: 'text',
      },
    ]);

    expect('Out' in row).toBe(false);
  });
});

describe('compileArithmeticExpr (safe evaluator — NO eval)', () => {
  it('compiles refs, literals, operators, parens, unary minus', () => {
    const { evaluate, maxInputRef } = compileArithmeticExpr(
      '-$1 + 2 * ($2 - 0.5)',
    );

    expect(maxInputRef).toBe(2);
    expect(evaluate([1, 2.5])).toBe(3);
  });

  it('applies standard precedence (* / before + -)', () => {
    expect(compileArithmeticExpr('2 + 3 * 4').evaluate([])).toBe(14);
    expect(compileArithmeticExpr('(2 + 3) * 4').evaluate([])).toBe(20);
  });

  it('rejects identifiers and function calls', () => {
    expect(() => compileArithmeticExpr('Math.max(1, 2)')).toThrow(
      ArithmeticExprError,
    );
    expect(() => compileArithmeticExpr('process')).toThrow(
      /identifiers\/functions are not allowed/,
    );
    expect(() => compileArithmeticExpr('$1 + abs($2)')).toThrow(
      ArithmeticExprError,
    );
  });

  it('rejects unexpected characters and malformed syntax', () => {
    expect(() => compileArithmeticExpr('1; 2')).toThrow(/unexpected character/);
    expect(() => compileArithmeticExpr('(1 + 2')).toThrow(
      /missing closing parenthesis/,
    );
    expect(() => compileArithmeticExpr('1 2')).toThrow(/unexpected trailing/);
    expect(() => compileArithmeticExpr('$0')).toThrow(/invalid input ref/);
    expect(() => compileArithmeticExpr('1 +')).toThrow(
      /unexpected end of expression/,
    );
  });

  it('null/missing inputs poison the result to null (not NaN)', () => {
    const { evaluate } = compileArithmeticExpr('$1 + $2');

    expect(evaluate([1, null])).toBeNull();
    expect(evaluate([1])).toBeNull();
  });
});

describe('validateComputedFieldParams (boundary helper)', () => {
  it('rejects params on param-less methods', () => {
    expect(
      validateComputedFieldParams({
        method: 'coalesce',
        inputs: ['A'],
        params: { separator: ',' },
      }),
    ).toEqual([expect.stringContaining('takes no params')]);

    expect(
      validateComputedFieldParams({ method: 'maxDate', inputs: ['A'] }),
    ).toEqual([]);
  });

  it('validates concat params', () => {
    expect(
      validateComputedFieldParams({
        method: 'concat',
        inputs: ['A'],
        params: { separator: 7 },
      }),
    ).toEqual([expect.stringContaining('params.separator must be a string')]);

    expect(
      validateComputedFieldParams({
        method: 'concat',
        inputs: ['A'],
        params: { sep: ' ' },
      }),
    ).toEqual([expect.stringContaining('params.sep is not a recognized')]);

    expect(
      validateComputedFieldParams({ method: 'concat', inputs: ['A'] }),
    ).toEqual([]);
  });

  it('requires conditional params with the row-filter op vocabulary', () => {
    expect(
      validateComputedFieldParams({ method: 'conditional', inputs: ['A'] }),
    ).toEqual([expect.stringContaining('requires params { if')]);

    const problems = validateComputedFieldParams({
      method: 'conditional',
      inputs: ['A'],
      params: {
        if: { column: 'Status', op: 'equalz', value: 'x' },
        then: '$1',
      },
    });

    expect(problems).toEqual([
      expect.stringContaining(
        `params.if.op "equalz" is not a recognized op — known ops: ${ROW_FILTER_OPS.join(', ')}`,
      ),
      expect.stringContaining('params.else is required'),
    ]);
  });

  it('checks conditional value-requiredness and ref bounds', () => {
    expect(
      validateComputedFieldParams({
        method: 'conditional',
        inputs: ['A'],
        params: {
          if: { column: 'Status', op: 'equals' },
          then: '$2',
          else: null,
        },
      }),
    ).toEqual([
      expect.stringContaining('params.if: op "equals" requires a non-empty'),
      expect.stringContaining(
        'params.then references input $2 but only 1 input(s) are declared',
      ),
    ]);
  });

  it('requires a compilable arithmetic expr with in-range refs', () => {
    expect(
      validateComputedFieldParams({ method: 'arithmetic', inputs: ['A'] }),
    ).toEqual([expect.stringContaining('requires params { expr')]);

    expect(
      validateComputedFieldParams({
        method: 'arithmetic',
        inputs: ['A'],
        params: { expr: 'evil()' },
      }),
    ).toEqual([
      expect.stringContaining('identifiers/functions are not allowed'),
    ]);

    expect(
      validateComputedFieldParams({
        method: 'arithmetic',
        inputs: ['A'],
        params: { expr: '$1 + $3' },
      }),
    ).toEqual([
      expect.stringContaining(
        'references input $3 but only 1 input(s) are declared',
      ),
    ]);

    expect(
      validateComputedFieldParams({
        method: 'arithmetic',
        inputs: ['A', 'B'],
        params: { expr: '($1 + $2) / 2' },
      }),
    ).toEqual([]);
  });

  it('returns no problems for unknown methods (reported elsewhere)', () => {
    expect(
      validateComputedFieldParams({
        method: 'nope',
        inputs: [],
        params: { x: 1 },
      }),
    ).toEqual([]);
  });
});
