import { formatDuration } from 'src/modules/policy/utils/format-duration.util';

const MINUTE_IN_MILLISECONDS = 60 * 1000;

describe('formatDuration', () => {
  it.each([
    [1, '1 minute'],
    [15, '15 minutes'],
    [60, '1 hour'],
    [12 * 60, '12 hours'],
    [24 * 60, '1 day'],
    [7 * 24 * 60, '7 days'],
  ])('formats %p minutes as %p', (minutes, expected) => {
    expect(formatDuration(minutes * MINUTE_IN_MILLISECONDS)).toBe(expected);
  });
});
