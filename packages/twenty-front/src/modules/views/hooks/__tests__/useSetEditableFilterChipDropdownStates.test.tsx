import { act, renderHook } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';

import { RecordComponentInstanceContextsWrapper } from '@/object-record/components/RecordComponentInstanceContextsWrapper';
import { fieldMetadataItemIdUsedInDropdownComponentState } from '@/object-record/object-filter-dropdown/states/fieldMetadataItemIdUsedInDropdownComponentState';
import { relationTargetFieldMetadataIdUsedInDropdownComponentState } from '@/object-record/object-filter-dropdown/states/relationTargetFieldMetadataIdUsedInDropdownComponentState';
import { selectedOperandInDropdownComponentState } from '@/object-record/object-filter-dropdown/states/selectedOperandInDropdownComponentState';
import { subFieldNameUsedInDropdownComponentState } from '@/object-record/object-filter-dropdown/states/subFieldNameUsedInDropdownComponentState';
import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { getEditableChipObjectFilterDropdownComponentInstanceId } from '@/views/editable-chip/utils/getEditableChipObjectFilterDropdownComponentInstanceId';
import { useSetEditableFilterChipDropdownStates } from '@/views/hooks/useSetEditableFilterChipDropdownStates';
import { mapViewFiltersToFilters } from '@/views/utils/mapViewFiltersToFilters';
import { RecordFilterOperand } from 'twenty-shared/types';
import { JestRecordIndexContextProviderWrapper } from '~/testing/jest/JestRecordIndexContextProviderWrapper';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';
import { getTestEnrichedObjectMetadataItemsMock } from '~/testing/utils/getTestEnrichedObjectMetadataItemsMock';
import { setTestObjectMetadataItemsInMetadataStore } from '~/testing/utils/setTestObjectMetadataItemsInMetadataStore';

const companyObjectMetadataItem = getMockObjectMetadataItemOrThrow('company');
const personObjectMetadataItem = getMockObjectMetadataItemOrThrow('person');
const workspaceMemberObjectMetadataItem =
  getMockObjectMetadataItemOrThrow('workspaceMember');

const companyPeopleField = companyObjectMetadataItem.fields.find(
  (field) => field.name === 'people',
)!;
const companyAccountOwnerField = companyObjectMetadataItem.fields.find(
  (field) => field.name === 'accountOwner',
)!;
const personJobTitleField = personObjectMetadataItem.fields.find(
  (field) => field.name === 'jobTitle',
)!;
const workspaceMemberUserEmailField =
  workspaceMemberObjectMetadataItem.fields.find(
    (field) => field.name === 'userEmail',
  )!;

const wrapper = ({ children }: { children: ReactNode }) => {
  setTestObjectMetadataItemsInMetadataStore(
    jotaiStore,
    getTestEnrichedObjectMetadataItemsMock(),
  );

  return (
    <JotaiProvider store={jotaiStore}>
      <RecordComponentInstanceContextsWrapper componentInstanceId="recordIndexId">
        <JestRecordIndexContextProviderWrapper
          objectMetadataItem={companyObjectMetadataItem}
        >
          {children}
        </JestRecordIndexContextProviderWrapper>
      </RecordComponentInstanceContextsWrapper>
    </JotaiProvider>
  );
};

const setChipStates = (recordFilter: RecordFilter) => {
  const { result } = renderHook(
    () => useSetEditableFilterChipDropdownStates(),
    {
      wrapper,
    },
  );

  act(() => {
    result.current.setEditableFilterChipDropdownStates(recordFilter);
  });

  return {
    instanceId: getEditableChipObjectFilterDropdownComponentInstanceId({
      recordFilterId: recordFilter.id,
    }),
  };
};

describe('useSetEditableFilterChipDropdownStates', () => {
  beforeEach(() => {
    resetJotaiStore();
  });

  it('opens a legacy one-to-many chip without its field, so its editor stays empty', () => {
    const [legacyRecordFilter] = mapViewFiltersToFilters(
      [
        {
          id: 'legacy-filter',
          fieldMetadataId: companyPeopleField.id,
          operand: RecordFilterOperand.IS,
          value: '["Founder"]',
          subFieldName: personJobTitleField.name,
          relationTargetFieldMetadataId: null,
        },
      ],
      companyObjectMetadataItem.fields,
    );

    const chipInstance = setChipStates(legacyRecordFilter);

    expect(
      jotaiStore.get(
        fieldMetadataItemIdUsedInDropdownComponentState.atomFamily(
          chipInstance,
        ),
      ),
    ).toBeNull();
    expect(
      jotaiStore.get(
        selectedOperandInDropdownComponentState.atomFamily(chipInstance),
      ),
    ).toBe(RecordFilterOperand.IS);
    expect(
      jotaiStore.get(
        subFieldNameUsedInDropdownComponentState.atomFamily(chipInstance),
      ),
    ).toBe(personJobTitleField.name);
    expect(
      jotaiStore.get(
        relationTargetFieldMetadataIdUsedInDropdownComponentState.atomFamily(
          chipInstance,
        ),
      ),
    ).toBeNull();
  });

  it('keeps the field and the relation target of a traversal chip', () => {
    const [traversalRecordFilter] = mapViewFiltersToFilters(
      [
        {
          id: 'traversal-filter',
          fieldMetadataId: companyAccountOwnerField.id,
          operand: RecordFilterOperand.CONTAINS,
          value: 'tim',
          relationTargetFieldMetadataId: workspaceMemberUserEmailField.id,
        },
      ],
      [
        ...companyObjectMetadataItem.fields,
        ...workspaceMemberObjectMetadataItem.fields,
      ],
    );

    const chipInstance = setChipStates(traversalRecordFilter);

    expect(
      jotaiStore.get(
        fieldMetadataItemIdUsedInDropdownComponentState.atomFamily(
          chipInstance,
        ),
      ),
    ).toBe(companyAccountOwnerField.id);
    expect(
      jotaiStore.get(
        relationTargetFieldMetadataIdUsedInDropdownComponentState.atomFamily(
          chipInstance,
        ),
      ),
    ).toBe(workspaceMemberUserEmailField.id);
  });
});
