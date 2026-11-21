import { hasCjkCharacters } from 'src/engine/core-modules/search/utils/has-cjk-characters';

// Upstream limits the substring fallback to CJK (#26926); agents also search digit fragments,
// such as a phone ending or the middle of a policy number, that prefix full-text search misses.
const DIGIT_FRAGMENT_PATTERN = /^\+?\d{3,}$/;

export const shouldRunIlikeFallback = (searchInput: string): boolean =>
  hasCjkCharacters(searchInput) ||
  DIGIT_FRAGMENT_PATTERN.test(searchInput.trim());
