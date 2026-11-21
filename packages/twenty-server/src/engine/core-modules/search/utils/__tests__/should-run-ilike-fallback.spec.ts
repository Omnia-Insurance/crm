import { shouldRunIlikeFallback } from 'src/engine/core-modules/search/utils/should-run-ilike-fallback';

describe('shouldRunIlikeFallback', () => {
  it.each(['商业', '9456948', '+12569456948', '945'])(
    'returns true for %s',
    (searchInput) => {
      expect(shouldRunIlikeFallback(searchInput)).toBe(true);
    },
  );

  it.each(['john', '12', '123456-01', 'john 9456948', ''])(
    'returns false for %s',
    (searchInput) => {
      expect(shouldRunIlikeFallback(searchInput)).toBe(false);
    },
  );
});
