import { describe, expect, it } from 'vitest';

import { parseAiJson } from 'src/utils/call-ai';

describe('Compliance QA AI JSON parsing', () => {
  it('escapes raw control characters inside JSON strings', () => {
    const parsed = parseAiJson(
      '{"evidence":"Consumer said hello\nAgent responded","score":90}',
    );

    expect(parsed).toEqual({
      evidence: 'Consumer said hello\nAgent responded',
      score: 90,
    });
  });
});
