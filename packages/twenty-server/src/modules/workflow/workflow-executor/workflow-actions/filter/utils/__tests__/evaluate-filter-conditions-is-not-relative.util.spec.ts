import { addDays, subDays } from 'date-fns';
import { type StepFilter, ViewFilterOperand } from 'twenty-shared/types';

import { evaluateFilterConditions } from 'src/modules/workflow/workflow-executor/workflow-actions/filter/utils/evaluate-filter-conditions.util';

type ResolvedFilter = Omit<StepFilter, 'value' | 'stepOutputKey'> & {
  rightOperand: unknown;
  leftOperand: unknown;
};

const PAST_THREE_DAYS = JSON.stringify({
  direction: 'PAST',
  amount: 3,
  unit: 'DAY',
});

const createDateFilter = (
  operand: ViewFilterOperand,
  leftOperand: unknown,
  type = 'DATE',
): ResolvedFilter => ({
  id: 'filter1',
  type,
  rightOperand: PAST_THREE_DAYS,
  operand,
  stepFilterGroupId: 'group1',
  leftOperand,
});

const evaluate = (filter: ResolvedFilter) =>
  evaluateFilterConditions({ filters: [filter] });

describe('evaluateFilterConditions with the IS_NOT_RELATIVE operand', () => {
  const now = new Date('2024-01-15T12:00:00Z');

  beforeEach(() => {
    jest.setSystemTime(now);
  });

  it('should not match a date inside the relative window', () => {
    expect(
      evaluate(
        createDateFilter(
          ViewFilterOperand.IS_NOT_RELATIVE,
          subDays(now, 1).toISOString(),
        ),
      ),
    ).toBe(false);
  });

  it('should match dates outside the relative window', () => {
    expect(
      evaluate(
        createDateFilter(
          ViewFilterOperand.IS_NOT_RELATIVE,
          subDays(now, 4).toISOString(),
        ),
      ),
    ).toBe(true);
    expect(
      evaluate(
        createDateFilter(
          ViewFilterOperand.IS_NOT_RELATIVE,
          addDays(now, 1).toISOString(),
          'DATE_TIME',
        ),
      ),
    ).toBe(true);
  });

  it('should be the negation of IS_RELATIVE for valid dates', () => {
    const dates = [
      subDays(now, 1),
      subDays(now, 3),
      subDays(now, 4),
      addDays(now, 1),
    ];

    for (const date of dates) {
      expect(
        evaluate(createDateFilter(ViewFilterOperand.IS_NOT_RELATIVE, date)),
      ).toBe(!evaluate(createDateFilter(ViewFilterOperand.IS_RELATIVE, date)));
    }
  });

  it.each(['', undefined, 'not-a-date'])(
    'should not match and not throw when the left operand is an empty or invalid date (%s)',
    (leftOperand) => {
      expect(
        evaluate(
          createDateFilter(ViewFilterOperand.IS_NOT_RELATIVE, leftOperand),
        ),
      ).toBe(false);
    },
  );
});
