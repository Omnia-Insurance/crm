import { toTemporalInstantOrNull } from '@/ui/field/display/utils/toTemporalInstantOrNull';

describe('toTemporalInstantOrNull', () => {
  it('parses an ISO date-time', () => {
    expect(
      toTemporalInstantOrNull('2026-03-04T15:30:00.000Z')?.toString(),
    ).toBe('2026-03-04T15:30:00Z');
  });

  it('parses an ISO date-time with an offset', () => {
    expect(
      toTemporalInstantOrNull('2026-03-04T10:30:00-05:00')?.toString(),
    ).toBe('2026-03-04T15:30:00Z');
  });

  it('reads a date-only value as midnight UTC', () => {
    expect(toTemporalInstantOrNull('2026-03-04')?.toString()).toBe(
      '2026-03-04T00:00:00Z',
    );
  });

  it('returns null for a value that is not a date', () => {
    expect(toTemporalInstantOrNull('not a date')).toBeNull();
  });

  it('returns null for an impossible date', () => {
    expect(toTemporalInstantOrNull('2026-02-30')).toBeNull();
  });

  it('returns null for a date-time without an offset', () => {
    expect(toTemporalInstantOrNull('2026-03-04T15:30:00')).toBeNull();
  });
});
