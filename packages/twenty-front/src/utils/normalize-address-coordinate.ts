const DECIMAL_NUMBER_PATTERN = /^-?(?:\d+|\d*\.\d+)$/;

export const normalizeAddressCoordinate = (
  coordinate: unknown,
): number | null => {
  if (typeof coordinate === 'number') {
    return Number.isFinite(coordinate) ? coordinate : null;
  }

  if (typeof coordinate !== 'string') {
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
