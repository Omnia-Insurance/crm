import {
  type BatchCandidateReviewItem,
  getBatchApplyCandidates,
  getBatchUndoCandidates,
} from '@/reconciliation/utils/getBatchActionCandidates';

const AUTO_MATCH_THRESHOLD = 85;
const BLOCKING_FLAGS: ReadonlySet<string> = new Set([
  'REINSTATEMENT',
  'BROKER_EFF_AUDIT',
  'MULTI_MATCH',
  'NAME_MISMATCH',
]);

const makeItem = (
  overrides: Partial<BatchCandidateReviewItem> = {},
): BatchCandidateReviewItem => ({
  id: 'item-1',
  decision: 'PENDING',
  category: 'UPDATE',
  confidence: 90,
  flags: null,
  ...overrides,
});

const unfilteredPolicy = {
  hasActiveFilters: false,
  autoMatchThreshold: AUTO_MATCH_THRESHOLD,
  blockingFlags: BLOCKING_FLAGS,
};

const filteredPolicy = {
  ...unfilteredPolicy,
  hasActiveFilters: true,
};

describe('getBatchApplyCandidates', () => {
  it('includes high-confidence pending items without blocking flags', () => {
    const items = [makeItem({ id: 'a' })];

    expect(getBatchApplyCandidates(items, unfilteredPolicy)).toEqual(items);
  });

  it('excludes non-PENDING decisions regardless of filter mode', () => {
    const items = [
      makeItem({ id: 'approved', decision: 'APPROVED' }),
      makeItem({ id: 'skipped', decision: 'SKIPPED' }),
      makeItem({ id: 'flagged', decision: 'FLAG_AUDIT' }),
    ];

    expect(getBatchApplyCandidates(items, unfilteredPolicy)).toEqual([]);
    expect(getBatchApplyCandidates(items, filteredPolicy)).toEqual([]);
  });

  it('excludes UNMATCHED items regardless of filter mode', () => {
    const items = [makeItem({ category: 'UNMATCHED' })];

    expect(getBatchApplyCandidates(items, unfilteredPolicy)).toEqual([]);
    expect(getBatchApplyCandidates(items, filteredPolicy)).toEqual([]);
  });

  it('excludes items below the confidence threshold when unfiltered', () => {
    const items = [makeItem({ confidence: 84 })];

    expect(getBatchApplyCandidates(items, unfilteredPolicy)).toEqual([]);
  });

  it('includes items exactly at the confidence threshold when unfiltered', () => {
    const items = [makeItem({ confidence: 85 })];

    expect(getBatchApplyCandidates(items, unfilteredPolicy)).toEqual(items);
  });

  it('excludes items with any blocking flag when unfiltered', () => {
    for (const flag of BLOCKING_FLAGS) {
      const items = [makeItem({ flags: ['SOMETHING_ELSE', flag] })];

      expect(getBatchApplyCandidates(items, unfilteredPolicy)).toEqual([]);
    }
  });

  it('keeps items whose flags are all non-blocking when unfiltered', () => {
    const items = [makeItem({ flags: ['STATUS_CHANGE'] })];

    expect(getBatchApplyCandidates(items, unfilteredPolicy)).toEqual(items);
  });

  it('treats null flags as non-blocking', () => {
    const items = [makeItem({ flags: null })];

    expect(getBatchApplyCandidates(items, unfilteredPolicy)).toEqual(items);
  });

  it('bypasses confidence and blocking-flag checks when a filter is active', () => {
    const items = [
      makeItem({ id: 'low-confidence', confidence: 10 }),
      makeItem({ id: 'blocked', flags: ['NAME_MISMATCH'] }),
    ];

    expect(getBatchApplyCandidates(items, filteredPolicy)).toEqual(items);
  });
});

describe('getBatchUndoCandidates', () => {
  it('includes only APPROVED items', () => {
    const approved = makeItem({ id: 'approved', decision: 'APPROVED' });
    const items = [
      approved,
      makeItem({ id: 'pending', decision: 'PENDING' }),
      makeItem({ id: 'skipped', decision: 'SKIPPED' }),
      makeItem({ id: 'flagged', decision: 'FLAG_AUDIT' }),
    ];

    expect(getBatchUndoCandidates(items)).toEqual([approved]);
  });

  it('excludes UNMATCHED items even when APPROVED', () => {
    const items = [
      makeItem({ decision: 'APPROVED', category: 'UNMATCHED' }),
    ];

    expect(getBatchUndoCandidates(items)).toEqual([]);
  });
});
