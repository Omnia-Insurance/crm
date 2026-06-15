import {
  getRunSummary,
  type ReconciliationRunRecordSlice,
} from '@/reconciliation/utils/getRunSummary';

const makeRecord = (
  overrides: ReconciliationRunRecordSlice = {},
): ReconciliationRunRecordSlice => ({
  status: 'REVIEW',
  errorMessage: null,
  stats: null,
  ...overrides,
});

describe('getRunSummary', () => {
  describe('status mapping', () => {
    it.each([
      ['PARSING', 'inProgress', 'Parsing file…'],
      ['MATCHING', 'inProgress', 'Matching rows…'],
      ['UPLOADED', 'inProgress', 'Uploaded — parse not started'],
      ['PARSED', 'inProgress', 'Parsed — awaiting matching'],
      ['REVIEW', 'review', 'In review'],
      ['COMPLETED', 'completed', 'Completed'],
      ['FAILED', 'failed', 'Run failed'],
    ] as const)('maps %s', (status, expectedKind, expectedLabel) => {
      const summary = getRunSummary(makeRecord({ status }));

      expect(summary.statusKind).toBe(expectedKind);
      expect(summary.statusLabel).toBe(expectedLabel);
    });

    it('passes through an unrecognized status value as the label', () => {
      const summary = getRunSummary(makeRecord({ status: 'SOMETHING_NEW' }));

      expect(summary.statusKind).toBe('unknown');
      expect(summary.statusLabel).toBe('SOMETHING_NEW');
    });

    it('handles a missing status', () => {
      const summary = getRunSummary({});

      expect(summary.statusKind).toBe('unknown');
      expect(summary.statusLabel).toBe('Status unknown');
    });
  });

  describe('errorMessage', () => {
    it('surfaces errorMessage for FAILED runs', () => {
      const summary = getRunSummary(
        makeRecord({
          status: 'FAILED',
          errorMessage: '[PARSE] Unknown status engine id "uho-bob-v1"',
        }),
      );

      expect(summary.errorMessage).toBe(
        '[PARSE] Unknown status engine id "uho-bob-v1"',
      );
    });

    it('returns null for a FAILED run with a blank message', () => {
      const summary = getRunSummary(
        makeRecord({ status: 'FAILED', errorMessage: '   ' }),
      );

      expect(summary.errorMessage).toBeNull();
    });

    it('hides a stale errorMessage on a non-FAILED run', () => {
      const summary = getRunSummary(
        makeRecord({
          status: 'REVIEW',
          errorMessage: '[MATCH] stale message from a previous attempt',
        }),
      );

      expect(summary.errorMessage).toBeNull();
    });
  });

  describe('stat chips', () => {
    it('renders all known counters when present, in display order', () => {
      const summary = getRunSummary(
        makeRecord({
          stats: {
            totalBobRows: 1204,
            autoMatched: 980,
            needsReview: 150,
            unmatched: 74,
            parseErrors: 3,
            skippedBeforeStartDate: 12,
            skippedInvalidPolicyNumber: 4,
          },
        }),
      );

      expect(summary.statChips).toEqual([
        { key: 'totalBobRows', text: '1,204 rows', isWarning: false },
        { key: 'autoMatched', text: '980 auto-matched', isWarning: false },
        { key: 'needsReview', text: '150 needs review', isWarning: false },
        { key: 'unmatched', text: '74 unmatched', isWarning: false },
        { key: 'parseErrors', text: '3 parse errors', isWarning: true },
        {
          key: 'skippedBeforeStartDate',
          text: '12 skipped before start date',
          isWarning: true,
        },
        {
          key: 'skippedInvalidPolicyNumber',
          text: '4 skipped — invalid policy #',
          isWarning: true,
        },
      ]);
      expect(summary.summaryText).toBe(
        '1,204 rows · 980 auto-matched · 150 needs review · 74 unmatched',
      );
      expect(summary.hasDetails).toBe(true);
    });

    it('renders only present keys for older runs lacking the newer counters', () => {
      const summary = getRunSummary(
        makeRecord({
          stats: {
            totalBobRows: 100,
            autoMatched: 90,
            needsReview: 8,
            unmatched: 2,
          },
        }),
      );

      expect(summary.statChips.map((chip) => chip.key)).toEqual([
        'totalBobRows',
        'autoMatched',
        'needsReview',
        'unmatched',
      ]);
      expect(summary.warningSummaryText).toBeNull();
    });

    it('uses singular labels for a count of one', () => {
      const summary = getRunSummary(
        makeRecord({ stats: { totalBobRows: 1, parseErrors: 1 } }),
      );

      expect(summary.statChips).toEqual([
        { key: 'totalBobRows', text: '1 row', isWarning: false },
        { key: 'parseErrors', text: '1 parse error', isWarning: true },
      ]);
    });

    it('ignores non-numeric and non-finite counter values', () => {
      const summary = getRunSummary(
        makeRecord({
          stats: {
            totalBobRows: '1204',
            autoMatched: NaN,
            needsReview: null,
            unmatched: 74,
          },
        }),
      );

      expect(summary.statChips).toEqual([
        { key: 'unmatched', text: '74 unmatched', isWarning: false },
      ]);
      expect(summary.summaryText).toBe('74 unmatched');
    });

    it('handles a null stats blob', () => {
      const summary = getRunSummary(makeRecord({ stats: null }));

      expect(summary.statChips).toEqual([]);
      expect(summary.summaryText).toBeNull();
      expect(summary.warningSummaryText).toBeNull();
      expect(summary.hasDetails).toBe(false);
    });

    it('handles a non-object stats blob', () => {
      const summary = getRunSummary(makeRecord({ stats: 'corrupted' }));

      expect(summary.statChips).toEqual([]);
      expect(summary.hasDetails).toBe(false);
    });
  });

  describe('warning counters', () => {
    it('aggregates non-zero warning counters into warningSummaryText', () => {
      const summary = getRunSummary(
        makeRecord({
          stats: {
            parseErrors: 3,
            skippedBeforeStartDate: 0,
            skippedInvalidPolicyNumber: 4,
          },
        }),
      );

      expect(summary.warningSummaryText).toBe(
        '3 parse errors · 4 skipped — invalid policy #',
      );
    });

    it('treats zero-valued warning counters as normal chips, not warnings', () => {
      const summary = getRunSummary(
        makeRecord({
          stats: {
            parseErrors: 0,
            skippedBeforeStartDate: 0,
            skippedInvalidPolicyNumber: 0,
          },
        }),
      );

      expect(summary.warningSummaryText).toBeNull();
      expect(summary.statChips.every((chip) => !chip.isWarning)).toBe(true);
    });

    it('flags a lone skip counter as a warning', () => {
      const summary = getRunSummary(
        makeRecord({ stats: { skippedBeforeStartDate: 250 } }),
      );

      expect(summary.warningSummaryText).toBe('250 skipped before start date');
      expect(summary.statChips).toEqual([
        {
          key: 'skippedBeforeStartDate',
          text: '250 skipped before start date',
          isWarning: true,
        },
      ]);
    });
  });

  describe('forward-compat fields', () => {
    it('returns persisted warnings, filtering non-string entries', () => {
      const summary = getRunSummary(
        makeRecord({
          stats: {
            warnings: [
              'Legacy engineId fallback: parserVersion used',
              42,
              null,
              '  ',
              'Unknown matchingConfig key "discoveryThreshld" ignored',
            ],
          },
        }),
      );

      expect(summary.warnings).toEqual([
        'Legacy engineId fallback: parserVersion used',
        'Unknown matchingConfig key "discoveryThreshld" ignored',
      ]);
      expect(summary.hasDetails).toBe(true);
    });

    it('tolerates absent or wrongly-shaped warnings silently', () => {
      expect(getRunSummary(makeRecord({ stats: {} })).warnings).toEqual([]);
      expect(
        getRunSummary(makeRecord({ stats: { warnings: 'oops' } })).warnings,
      ).toEqual([]);
    });

    it('returns the configFingerprint when present', () => {
      const summary = getRunSummary(
        makeRecord({ stats: { configFingerprint: 'a1b2c3d4' } }),
      );

      expect(summary.configFingerprint).toBe('a1b2c3d4');
      expect(summary.hasDetails).toBe(true);
    });

    it('tolerates absent or non-string configFingerprint silently', () => {
      expect(
        getRunSummary(makeRecord({ stats: {} })).configFingerprint,
      ).toBeNull();
      expect(
        getRunSummary(makeRecord({ stats: { configFingerprint: 123 } }))
          .configFingerprint,
      ).toBeNull();
      expect(
        getRunSummary(makeRecord({ stats: { configFingerprint: '' } }))
          .configFingerprint,
      ).toBeNull();
    });
  });
});
