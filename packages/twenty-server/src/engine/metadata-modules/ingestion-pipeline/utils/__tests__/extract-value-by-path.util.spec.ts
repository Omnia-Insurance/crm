import { extractValueByPath } from 'src/engine/metadata-modules/ingestion-pipeline/utils/extract-value-by-path.util';

describe('extractValueByPath', () => {
  it('should extract a top-level value', () => {
    expect(extractValueByPath({ name: 'John' }, 'name')).toBe('John');
  });

  it('should extract a nested value', () => {
    const data = { user: { profile: { name: 'John' } } };

    expect(extractValueByPath(data, 'user.profile.name')).toBe('John');
  });

  it('should extract a value from an array using bracket notation', () => {
    const data = { items: ['a', 'b', 'c'] };

    expect(extractValueByPath(data, 'items[1]')).toBe('b');
  });

  it('should extract a nested value from an array element', () => {
    const data = { users: [{ name: 'Alice' }, { name: 'Bob' }] };

    expect(extractValueByPath(data, 'users[0].name')).toBe('Alice');
  });

  it('should return undefined for non-existent paths', () => {
    expect(extractValueByPath({ a: 1 }, 'b')).toBeUndefined();
    expect(extractValueByPath({ a: 1 }, 'a.b.c')).toBeUndefined();
  });

  it('should return undefined for empty path', () => {
    expect(extractValueByPath({ a: 1 }, '')).toBeUndefined();
  });

  it('should return undefined for null data', () => {
    expect(
      extractValueByPath(null as unknown as Record<string, unknown>, 'a'),
    ).toBeUndefined();
  });

  it('should handle custom_fields dot-notation paths', () => {
    const data = { custom_fields: { field_101: 'Medicare' } };

    expect(extractValueByPath(data, 'custom_fields.field_101')).toBe(
      'Medicare',
    );
  });

  it('should handle deeply nested paths with arrays', () => {
    const data = {
      data: {
        entries: [
          { attributes: { firstName: 'John', lastName: 'Doe' } },
        ],
      },
    };

    expect(
      extractValueByPath(data, 'data.entries[0].attributes.firstName'),
    ).toBe('John');
  });
});
