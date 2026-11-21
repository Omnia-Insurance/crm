import { normalizeSearchInput } from 'src/engine/core-modules/search/utils/normalize-search-input';

describe('normalizeSearchInput', () => {
  it.each([
    ['(256) 945-6948', '2569456948'],
    ['+1 (256) 945-6948', '+12569456948'],
    ['+1 256 945 6948', '+12569456948'],
    ['256-945-6948', '2569456948'],
    ['256.945.6948', '2569456948'],
    ['256 945 6948', '2569456948'],
    ['256 945', '256945'],
    ['256 9456948', '2569456948'],
    ['1 256 945 6948', '12569456948'],
    ['(256)', '256'],
    ['  (256) 945-6948  ', '2569456948'],
  ])('normalizes %s to %s', (searchInput, expected) => {
    expect(normalizeSearchInput(searchInput)).toBe(expected);
  });

  it.each([
    '+12569456948',
    '2569456948',
    'john doe',
    'john@example.com',
    '123 Main St',
    '123456-01',
    '1234 5678',
    'U71234567',
    '(12)',
  ])('returns %s unchanged', (searchInput) => {
    expect(normalizeSearchInput(searchInput)).toBe(searchInput);
  });

  it('trims input that is not phone-shaped', () => {
    expect(normalizeSearchInput('  123456-01 ')).toBe('123456-01');
  });

  it('returns an empty string for blank input', () => {
    expect(normalizeSearchInput('')).toBe('');
    expect(normalizeSearchInput('   ')).toBe('');
  });
});
