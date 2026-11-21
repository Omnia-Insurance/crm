import { isNumber, isString } from '@sniptt/guards';

const DECIMAL_NUMBER_PATTERN = /^-?(?:\d+|\d*\.\d+)$/;

export const normalizeAddressCoordinate = (
  coordinate: unknown,
): number | null => {
  if (isNumber(coordinate)) {
    return Number.isFinite(coordinate) ? coordinate : null;
  }

  if (!isString(coordinate)) {
    return null;
  }

  const trimmedCoordinate = coordinate.trim();

  if (
    trimmedCoordinate.length === 0 ||
    !DECIMAL_NUMBER_PATTERN.test(trimmedCoordinate)
  ) {
    return null;
  }

  const parsedCoordinate = Number(trimmedCoordinate);

  return Number.isFinite(parsedCoordinate) ? parsedCoordinate : null;
};
