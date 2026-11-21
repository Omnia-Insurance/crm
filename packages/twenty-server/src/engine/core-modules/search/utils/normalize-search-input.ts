const PHONE_CHARACTERS_ONLY_PATTERN = /^[+\d()\-.\s]+$/;
const GROUPED_PHONE_DIGITS_PATTERN = /^\d{3}[\s.-]\d{3}([\s.-]\d{1,4})?$/;
const NON_DIGIT_PATTERN = /\D/g;
const MIN_PHONE_DIGIT_COUNT = 3;
const FULL_PHONE_DIGIT_COUNTS = [10, 11];

// Hyphenated or spaced policy and application numbers ("123456-01", "1234 5678") are
// tokenized as typed, so only phone-shaped input may collapse to digits.
const isPhoneShaped = (trimmedSearchInput: string, digits: string) =>
  /[()]/.test(trimmedSearchInput) ||
  trimmedSearchInput.startsWith('+') ||
  GROUPED_PHONE_DIGITS_PATTERN.test(trimmedSearchInput) ||
  FULL_PHONE_DIGIT_COUNTS.includes(digits.length);

export const normalizeSearchInput = (searchInput: string): string => {
  const trimmedSearchInput = searchInput.trim();

  if (!PHONE_CHARACTERS_ONLY_PATTERN.test(trimmedSearchInput)) {
    return trimmedSearchInput;
  }

  const digits = trimmedSearchInput.replace(NON_DIGIT_PATTERN, '');

  if (
    digits.length < MIN_PHONE_DIGIT_COUNT ||
    !isPhoneShaped(trimmedSearchInput, digits)
  ) {
    return trimmedSearchInput;
  }

  return trimmedSearchInput.startsWith('+') ? `+${digits}` : digits;
};
