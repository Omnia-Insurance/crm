import {
  formatOneToManyItem,
  formatOneToManyList,
} from 'src/engine/core-modules/record-export/utils/format-one-to-many-export-list.util';

describe('formatOneToManyList', () => {
  it('joins labels with a pipe when nothing was capped', () => {
    expect(formatOneToManyList(['Ann', 'Bob'], 2)).toBe('Ann | Bob');
    expect(formatOneToManyList(['Ann', 'Bob'], undefined)).toBe('Ann | Bob');
  });

  it('appends "+N more" when the total exceeds the rendered labels', () => {
    expect(formatOneToManyList(['Ann', 'Bob'], 5753)).toBe(
      'Ann | Bob | +5751 more',
    );
  });

  it('drops empty labels but still counts them against the cap', () => {
    expect(formatOneToManyList(['Ann', '', 'Cid'], 10)).toBe(
      'Ann | Cid | +7 more',
    );
  });

  it('returns an empty string for no children', () => {
    expect(formatOneToManyList([], 0)).toBe('');
  });
});

describe('formatOneToManyItem', () => {
  it('formats a family member as "Name • Type • MM/DD/YY"', () => {
    expect(
      formatOneToManyItem({
        item: {
          name: 'Bo Lee',
          memberType: 'SPOUSE',
          dateOfBirth: '1981-04-05',
        },
        labelFieldName: 'name',
      }),
    ).toBe('Bo Lee • Spouse • 04/05/81');
  });

  it('reads the birth date in UTC from a date or a timestamp', () => {
    expect(
      formatOneToManyItem({
        item: {
          name: 'Cy',
          memberType: null,
          dateOfBirth: new Date('2010-12-31T00:00:00.000Z'),
        },
        labelFieldName: 'name',
      }),
    ).toBe('Cy • 12/31/10');
  });

  it('skips the parts a family member does not have', () => {
    expect(
      formatOneToManyItem({
        item: { name: null, memberType: 'CHILD', dateOfBirth: 'not a date' },
        labelFieldName: 'name',
      }),
    ).toBe('Child');
    expect(
      formatOneToManyItem({
        item: { name: '', memberType: null, dateOfBirth: null },
        labelFieldName: 'name',
      }),
    ).toBe('');
  });

  it('formats other children by their label, FULL_NAME included', () => {
    expect(
      formatOneToManyItem({
        item: { name: { firstName: 'Ann', lastName: 'Lee' } },
        labelFieldName: 'name',
      }),
    ).toBe('Ann Lee');
    expect(formatOneToManyItem({ item: { title: 'Follow up' } })).toBe('');
  });

  it('never exports a record id as a label', () => {
    expect(
      formatOneToManyItem({
        item: { name: '6f1ae5d5-8b1c-4f43-9a3e-0f0b6a2b7c11' },
        labelFieldName: 'name',
      }),
    ).toBe('');
  });
});
