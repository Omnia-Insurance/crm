import { act, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { RecoilRoot } from 'recoil';

import { multipleRecordPickerAdditionalFilterComponentState } from '@/object-record/record-picker/multiple-record-picker/states/multipleRecordPickerAdditionalFilterComponentState';
import { useRecoilComponentValue } from '@/ui/utilities/state/component-state/hooks/useRecoilComponentValue';
import { useSetRecoilComponentState } from '@/ui/utilities/state/component-state/hooks/useSetRecoilComponentState';
import { type ObjectRecordFilterInput } from '~/generated/graphql';

// Mirrors the filter logic in RecordDetailRelationSectionDropdownToMany.
// The component builds an additionalFilter from the inverse relation field
// name so that the picker only shows records that are either unattached
// (FK is NULL) or already linked to the current parent record.
const buildExcludeAttachedFilter = (
  inverseFieldName: string,
  recordId: string,
): ObjectRecordFilterInput => ({
  or: [
    { [`${inverseFieldName}Id`]: { is: 'NULL' } },
    { [`${inverseFieldName}Id`]: { eq: recordId } },
  ],
});

const LEAD_RECORD_ID = 'test-lead-record-id';
const DROPDOWN_ID = 'test-dropdown-id';

describe('RecordDetailRelationSectionDropdownToMany - excludeAttachedFilter', () => {
  describe('filter construction for Lead → Policies relation', () => {
    // In the workspace the Policy object has a "lead" relation (Belongs to one)
    // pointing back to the Person (Lead) object. The FK column is "leadId".
    const inverseFieldName = 'lead';

    it('should exclude policies already attached to a different lead', () => {
      const filter = buildExcludeAttachedFilter(inverseFieldName, LEAD_RECORD_ID);

      expect(filter).toEqual({
        or: [
          { leadId: { is: 'NULL' } },
          { leadId: { eq: LEAD_RECORD_ID } },
        ],
      });
    });

    it('should allow policies with no lead (leadId is NULL)', () => {
      const filter = buildExcludeAttachedFilter(inverseFieldName, LEAD_RECORD_ID);

      const nullClause = (filter.or as ObjectRecordFilterInput[])[0];
      expect(nullClause).toEqual({ leadId: { is: 'NULL' } });
    });

    it('should allow policies already linked to this lead', () => {
      const filter = buildExcludeAttachedFilter(inverseFieldName, LEAD_RECORD_ID);

      const eqClause = (filter.or as ObjectRecordFilterInput[])[1];
      expect(eqClause).toEqual({ leadId: { eq: LEAD_RECORD_ID } });
    });
  });

  describe('filter construction adapts to different inverse field names', () => {
    it('should use agentId for a Policy → Agent relation', () => {
      const filter = buildExcludeAttachedFilter('agent', 'some-agent-id');

      expect(filter).toEqual({
        or: [
          { agentId: { is: 'NULL' } },
          { agentId: { eq: 'some-agent-id' } },
        ],
      });
    });

    it('should use carrierId for a Policy → Carrier relation', () => {
      const filter = buildExcludeAttachedFilter('carrier', 'some-carrier-id');

      expect(filter).toEqual({
        or: [
          { carrierId: { is: 'NULL' } },
          { carrierId: { eq: 'some-carrier-id' } },
        ],
      });
    });
  });

  describe('Recoil state integration', () => {
    it('should store the filter in multipleRecordPickerAdditionalFilter state', () => {
      const expectedFilter = buildExcludeAttachedFilter('lead', LEAD_RECORD_ID);

      const Wrapper = ({ children }: { children: ReactNode }) => (
        <RecoilRoot>{children}</RecoilRoot>
      );

      const { result } = renderHook(
        () => {
          const setAdditionalFilter = useSetRecoilComponentState(
            multipleRecordPickerAdditionalFilterComponentState,
            DROPDOWN_ID,
          );
          const additionalFilter = useRecoilComponentValue(
            multipleRecordPickerAdditionalFilterComponentState,
            DROPDOWN_ID,
          );

          return { setAdditionalFilter, additionalFilter };
        },
        { wrapper: Wrapper },
      );

      expect(result.current.additionalFilter).toBeUndefined();

      act(() => {
        result.current.setAdditionalFilter(expectedFilter);
      });

      expect(result.current.additionalFilter).toEqual({
        or: [
          { leadId: { is: 'NULL' } },
          { leadId: { eq: LEAD_RECORD_ID } },
        ],
      });
    });

    it('should allow clearing the filter by setting undefined', () => {
      const filter = buildExcludeAttachedFilter('lead', LEAD_RECORD_ID);

      const Wrapper = ({ children }: { children: ReactNode }) => (
        <RecoilRoot>{children}</RecoilRoot>
      );

      const { result } = renderHook(
        () => {
          const setAdditionalFilter = useSetRecoilComponentState(
            multipleRecordPickerAdditionalFilterComponentState,
            DROPDOWN_ID,
          );
          const additionalFilter = useRecoilComponentValue(
            multipleRecordPickerAdditionalFilterComponentState,
            DROPDOWN_ID,
          );

          return { setAdditionalFilter, additionalFilter };
        },
        { wrapper: Wrapper },
      );

      act(() => {
        result.current.setAdditionalFilter(filter);
      });

      expect(result.current.additionalFilter).toBeDefined();

      act(() => {
        result.current.setAdditionalFilter(undefined);
      });

      expect(result.current.additionalFilter).toBeUndefined();
    });
  });
});
