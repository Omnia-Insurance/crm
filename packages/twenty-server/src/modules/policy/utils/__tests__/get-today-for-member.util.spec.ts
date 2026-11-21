import { getNowUtc } from 'src/modules/policy/utils/get-today-for-member.util';

describe('getNowUtc', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-18T23:30:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the current moment as a UTC ISO string', () => {
    expect(getNowUtc()).toBe('2026-11-18T23:30:00.000Z');
  });
});
