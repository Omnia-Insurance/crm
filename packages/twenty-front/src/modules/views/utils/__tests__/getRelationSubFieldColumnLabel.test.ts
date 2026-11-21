import { getRelationSubFieldColumnLabel } from '@/views/utils/getRelationSubFieldColumnLabel';

describe('getRelationSubFieldColumnLabel', () => {
  it('should join the relation and sub-field labels with a slash', () => {
    expect(
      getRelationSubFieldColumnLabel({
        relationFieldLabel: 'Lead',
        subFieldLabel: 'Date of Birth',
      }),
    ).toBe('Lead / Date of Birth');
  });

  it('should keep labels that already contain a slash as they are', () => {
    expect(
      getRelationSubFieldColumnLabel({
        relationFieldLabel: 'Agent',
        subFieldLabel: 'NPN / License',
      }),
    ).toBe('Agent / NPN / License');
  });
});
