import { act, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { Provider as JotaiProvider } from 'jotai';

import {
  buildIdAllowlistFilter,
  buildRelationPickerEligibleRecordsFilter,
} from '@/object-record/record-picker/hooks/useLeadPolicyRecordPickerAdditionalFilter';
import { multipleRecordPickerAdditionalFilterComponentState } from '@/object-record/record-picker/multiple-record-picker/states/multipleRecordPickerAdditionalFilterComponentState';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';
import { jotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';

// The search API's ObjectRecordFilterInput only supports generic fields
// (id, createdAt, updatedAt, deletedAt). To filter by custom relation fields
// like "leadId", the component pre-fetches eligible record IDs via
// useFindManyRecords (which uses per-object GraphQL filters), then passes
// { id: { in: [...] } } as the additionalFilter to the search-based picker.

const SENTINEL_UUID = '00000000-0000-0000-0000-000000000000';
const DROPDOWN_ID = 'test-dropdown-id';

describe('RecordDetailRelationSectionDropdownToMany - eligiblePolicyFilter', () => {
  describe('ID-based filter from pre-fetched eligible records', () => {
    it('should produce an id-in filter when eligible policies exist', () => {
      const eligiblePolicyIds = [
        'policy-1-no-lead',
        'policy-2-no-lead',
        'policy-3-this-lead',
      ];

      const filter = buildIdAllowlistFilter(eligiblePolicyIds);

      expect(filter).toEqual({
        id: {
          in: ['policy-1-no-lead', 'policy-2-no-lead', 'policy-3-this-lead'],
        },
      });
    });

    it('should produce a sentinel filter when no eligible policies exist', () => {
      const filter = buildIdAllowlistFilter([]);

      expect(filter).toEqual({
        id: { eq: SENTINEL_UUID },
      });
    });

    it('should only contain id field which is valid for ObjectRecordFilterInput', () => {
      const filter = buildIdAllowlistFilter(['policy-1']);

      // The search API only supports id, createdAt, updatedAt, deletedAt, and/or/not.
      // Custom field names like leadId are NOT valid and would cause a GraphQL error.
      const keys = Object.keys(filter);
      expect(keys).toEqual(['id']);
    });
  });

  describe('useFindManyRecords filter for Lead → Policies', () => {
    // This is the per-object filter passed to useFindManyRecords, which
    // DOES support custom field names because it uses the object-specific
    // GraphQL type, not the generic ObjectRecordFilterInput.
    it('should construct the correct per-object filter for policies', () => {
      const inverseFieldName = 'lead';
      const recordId = 'test-lead-id';

      const findManyFilter = buildRelationPickerEligibleRecordsFilter({
        inverseFieldName,
        recordId,
      });

      expect(findManyFilter).toEqual({
        or: [{ leadId: { is: 'NULL' } }, { leadId: { eq: 'test-lead-id' } }],
      });
    });

    it('should adapt to different inverse field names', () => {
      const cases = [
        {
          inverseFieldName: 'agent',
          recordId: 'agent-1',
          expectedKey: 'agentId',
        },
        {
          inverseFieldName: 'carrier',
          recordId: 'carrier-1',
          expectedKey: 'carrierId',
        },
        {
          inverseFieldName: 'company',
          recordId: 'company-1',
          expectedKey: 'companyId',
        },
      ];

      for (const { inverseFieldName, recordId, expectedKey } of cases) {
        const filter = buildRelationPickerEligibleRecordsFilter({
          inverseFieldName,
          recordId,
        });

        expect(filter.or[0]).toHaveProperty(expectedKey);
        expect(filter.or[1]).toHaveProperty(expectedKey);
      }
    });
  });

  describe('Jotai state integration', () => {
    it('should store the id-based filter in multipleRecordPickerAdditionalFilter state', () => {
      const expectedFilter = buildIdAllowlistFilter(['policy-1', 'policy-2']);

      const Wrapper = ({ children }: { children: ReactNode }) => (
        <JotaiProvider store={jotaiStore}>{children}</JotaiProvider>
      );

      const { result } = renderHook(
        () => {
          const setMultipleRecordPickerAdditionalFilter =
            useSetAtomComponentState(
              multipleRecordPickerAdditionalFilterComponentState,
              DROPDOWN_ID,
            );
          const multipleRecordPickerAdditionalFilter =
            useAtomComponentStateValue(
              multipleRecordPickerAdditionalFilterComponentState,
              DROPDOWN_ID,
            );

          return {
            setMultipleRecordPickerAdditionalFilter,
            multipleRecordPickerAdditionalFilter,
          };
        },
        { wrapper: Wrapper },
      );

      expect(
        result.current.multipleRecordPickerAdditionalFilter,
      ).toBeUndefined();

      act(() => {
        result.current.setMultipleRecordPickerAdditionalFilter(expectedFilter);
      });

      expect(result.current.multipleRecordPickerAdditionalFilter).toEqual({
        id: { in: ['policy-1', 'policy-2'] },
      });
    });

    it('should allow clearing the filter by setting undefined', () => {
      const filter = buildIdAllowlistFilter(['policy-1']);

      const Wrapper = ({ children }: { children: ReactNode }) => (
        <JotaiProvider store={jotaiStore}>{children}</JotaiProvider>
      );

      const { result } = renderHook(
        () => {
          const setMultipleRecordPickerAdditionalFilter =
            useSetAtomComponentState(
              multipleRecordPickerAdditionalFilterComponentState,
              DROPDOWN_ID,
            );
          const multipleRecordPickerAdditionalFilter =
            useAtomComponentStateValue(
              multipleRecordPickerAdditionalFilterComponentState,
              DROPDOWN_ID,
            );

          return {
            setMultipleRecordPickerAdditionalFilter,
            multipleRecordPickerAdditionalFilter,
          };
        },
        { wrapper: Wrapper },
      );

      act(() => {
        result.current.setMultipleRecordPickerAdditionalFilter(filter);
      });

      expect(result.current.multipleRecordPickerAdditionalFilter).toBeDefined();

      act(() => {
        result.current.setMultipleRecordPickerAdditionalFilter(undefined);
      });

      expect(
        result.current.multipleRecordPickerAdditionalFilter,
      ).toBeUndefined();
    });
  });
});
