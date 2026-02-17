import { isDefined } from 'twenty-shared/utils';

// Extracts a value from a nested object using dot-notation path.
// Supports array indexing via bracket notation (e.g. "items[0].name").
// Returns undefined if the path doesn't resolve.
export const extractValueByPath = (
  data: Record<string, unknown>,
  path: string,
): unknown => {
  if (!isDefined(data) || !isDefined(path) || path === '') {
    return undefined;
  }

  const segments = path.split('.').flatMap((segment) => {
    const match = segment.match(/^([^[]+)\[(\d+)\]$/);

    if (match) {
      return [match[1], Number(match[2])];
    }

    return [segment];
  });

  let current: unknown = data;

  for (const segment of segments) {
    if (!isDefined(current) || typeof current !== 'object') {
      return undefined;
    }

    if (Array.isArray(current) && typeof segment === 'number') {
      current = current[segment];
    } else if (
      typeof current === 'object' &&
      current !== null &&
      typeof segment === 'string'
    ) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }

  return current;
};
