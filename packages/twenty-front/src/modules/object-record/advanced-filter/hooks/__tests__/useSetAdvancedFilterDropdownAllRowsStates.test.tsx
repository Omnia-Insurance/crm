import { act, renderHook } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';

import { useSetAdvancedFilterDropdownStates } from '@/object-record/advanced-filter/hooks/useSetAdvancedFilterDropdownAllRowsStates';
import { getAdvancedFilterObjectFilterDropdownComponentInstanceId } from '@/object-record/advanced-filter/utils/getAdvancedFilterObjectFilterDropdownComponentInstanceId';
import { fieldMetadataItemIdUsedInDropdownComponentState } from '@/object-record/object-filter-dropdown/states/fieldMetadataItemIdUsedInDropdownComponentState';
import { relationTargetFieldMetadataIdUsedInDropdownComponentState } from '@/object-record/object-filter-dropdown/states/relationTargetFieldMetadataIdUsedInDropdownComponentState';
import { subFieldNameUsedInDropdownComponentState } from '@/object-record/object-filter-dropdown/states/subFieldNameUsedInDropdownComponentState';
import { RecordFilterGroupsComponentInstanceContext } from '@/object-record/record-filter-group/states/context/RecordFilterGroupsComponentInstanceContext';
import { currentRecordFilterGroupsComponentState } from '@/object-record/record-filter-group/states/currentRecordFilterGroupsComponentState';
import { RecordFiltersComponentInstanceContext } from '@/object-record/record-filter/states/context/RecordFiltersComponentInstanceContext';
import { currentRecordFiltersComponentState } from '@/object-record/record-filter/states/currentRecordFiltersComponentState';
import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { mapViewFiltersToFilters } from '@/views/utils/mapViewFiltersToFilters';
import {
  RecordFilterGroupLogicalOperator,
  RecordFilterOperand,
} from 'twenty-shared/types';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

const INSTANCE_ID = 'advanced-filter-rows-test';
const ROOT_GROUP_ID = 'root-group';
const CHILD_GROUP_ID = 'child-group';

const companyObjectMetadataItem = getMockObjectMetadataItemOrThrow('company');
const personObjectMetadataItem = getMockObjectMetadataItemOrThrow('person');

const companyPeopleField = companyObjectMetadataItem.fields.find(
  (field) => field.name === 'people',
)!;
const personJobTitleField = personObjectMetadataItem.fields.find(
  (field) => field.name === 'jobTitle',
)!;

const [traversalRecordFilter, legacyRecordFilter] = mapViewFiltersToFilters(
  [
    {
      id: 'traversal-row',
      fieldMetadataId: companyPeopleField.id,
      operand: RecordFilterOperand.CONTAINS,
      value: 'Founder',
      relationTargetFieldMetadataId: personJobTitleField.id,
      viewFilterGroupId: ROOT_GROUP_ID,
    },
    {
      id: 'legacy-row',
      fieldMetadataId: companyPeopleField.id,
      operand: RecordFilterOperand.IS,
      value: '["Founder"]',
      subFieldName: personJobTitleField.name,
      relationTargetFieldMetadataId: null,
      viewFilterGroupId: CHILD_GROUP_ID,
    },
  ],
  [...companyObjectMetadataItem.fields, ...personObjectMetadataItem.fields],
);

const wrapper = ({ children }: { children: ReactNode }) => (
  <JotaiProvider store={jotaiStore}>
    <RecordFilterGroupsComponentInstanceContext.Provider
      value={{ instanceId: INSTANCE_ID }}
    >
      <RecordFiltersComponentInstanceContext.Provider
        value={{ instanceId: INSTANCE_ID }}
      >
        {children}
      </RecordFiltersComponentInstanceContext.Provider>
    </RecordFilterGroupsComponentInstanceContext.Provider>
  </JotaiProvider>
);

const getRowInstance = (recordFilter: RecordFilter) => ({
  instanceId: getAdvancedFilterObjectFilterDropdownComponentInstanceId(
    recordFilter.id,
  ),
});

describe('useSetAdvancedFilterDropdownStates', () => {
  beforeEach(() => {
    resetJotaiStore();

    jotaiStore.set(
      currentRecordFilterGroupsComponentState.atomFamily({
        instanceId: INSTANCE_ID,
      }),
      [
        {
          id: ROOT_GROUP_ID,
          logicalOperator: RecordFilterGroupLogicalOperator.AND,
        },
        {
          id: CHILD_GROUP_ID,
          parentRecordFilterGroupId: ROOT_GROUP_ID,
          logicalOperator: RecordFilterGroupLogicalOperator.OR,
        },
      ],
    );

    jotaiStore.set(
      currentRecordFiltersComponentState.atomFamily({
        instanceId: INSTANCE_ID,
      }),
      [traversalRecordFilter, legacyRecordFilter],
    );
  });

  it('restores the relation target of every row so value pickers query the target object', () => {
    const { result } = renderHook(() => useSetAdvancedFilterDropdownStates(), {
      wrapper,
    });

    act(() => {
      result.current.setAdvancedFilterDropdownStates();
    });

    expect(
      jotaiStore.get(
        relationTargetFieldMetadataIdUsedInDropdownComponentState.atomFamily(
          getRowInstance(traversalRecordFilter),
        ),
      ),
    ).toBe(personJobTitleField.id);
    expect(
      jotaiStore.get(
        fieldMetadataItemIdUsedInDropdownComponentState.atomFamily(
          getRowInstance(traversalRecordFilter),
        ),
      ),
    ).toBe(companyPeopleField.id);
  });

  it('opens a legacy row without a relation target', () => {
    const { result } = renderHook(() => useSetAdvancedFilterDropdownStates(), {
      wrapper,
    });

    act(() => {
      result.current.setAdvancedFilterDropdownStates();
    });

    expect(
      jotaiStore.get(
        relationTargetFieldMetadataIdUsedInDropdownComponentState.atomFamily(
          getRowInstance(legacyRecordFilter),
        ),
      ),
    ).toBeNull();
    expect(
      jotaiStore.get(
        subFieldNameUsedInDropdownComponentState.atomFamily(
          getRowInstance(legacyRecordFilter),
        ),
      ),
    ).toBe(personJobTitleField.name);
  });
});
