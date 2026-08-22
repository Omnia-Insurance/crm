import {
  capChildIdsByParent,
  formatOneToManyList,
  ONE_TO_MANY_EXPORT_CHILD_CAP,
} from 'src/engine/core-modules/export-job/utils/one-to-many-export.util';

describe('capChildIdsByParent', () => {
  it('keeps at most `cap` ids per parent, preserving order, and counts totals', () => {
    const rows = [
      { id: 'a1', parentId: 'A' },
      { id: 'a2', parentId: 'A' },
      { id: 'b1', parentId: 'B' },
      { id: 'a3', parentId: 'A' },
      { id: 'a4', parentId: 'A' },
    ];

    const { cappedIdsByParent, totalByParent } = capChildIdsByParent(rows, 2);

    expect(cappedIdsByParent.get('A')).toEqual(['a1', 'a2']);
    expect(cappedIdsByParent.get('B')).toEqual(['b1']);
    expect(totalByParent.get('A')).toBe(4);
    expect(totalByParent.get('B')).toBe(1);
  });

  it('ignores rows without a parent id or child id', () => {
    const { cappedIdsByParent, totalByParent } = capChildIdsByParent(
      [
        { id: 'x', parentId: null },
        { id: '', parentId: 'A' },
      ],
      5,
    );

    expect(cappedIdsByParent.size).toBe(0);
    expect(totalByParent.size).toBe(0);
  });

  it('defaults the cap to the table relation limit', () => {
    expect(ONE_TO_MANY_EXPORT_CHILD_CAP).toBe(60);
  });
});

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
