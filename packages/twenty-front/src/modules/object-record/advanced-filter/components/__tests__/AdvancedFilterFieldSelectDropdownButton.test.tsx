import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useEffect, useState } from 'react';

import { AdvancedFilterFieldSelectDropdownButton } from '@/object-record/advanced-filter/components/AdvancedFilterFieldSelectDropdownButton';
import { AdvancedFilterContext } from '@/object-record/advanced-filter/states/context/AdvancedFilterContext';
import { getAdvancedFilterObjectFilterDropdownComponentInstanceId } from '@/object-record/advanced-filter/utils/getAdvancedFilterObjectFilterDropdownComponentInstanceId';
import { ObjectFilterDropdownComponentInstanceContext } from '@/object-record/object-filter-dropdown/states/contexts/ObjectFilterDropdownComponentInstanceContext';
import { currentRecordFiltersComponentState } from '@/object-record/record-filter/states/currentRecordFiltersComponentState';
import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import { jotaiStore } from '@/ui/utilities/state/jotai/jotaiStore';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';
import { RecordFilterOperand } from 'twenty-shared/types';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

const RECORD_FILTERS_INSTANCE_ID = 'instanceId';
const RECORD_FILTER_ID = 'one-to-many-filter';

const companyObjectMetadataItem = getMockObjectMetadataItemOrThrow('company');
const personObjectMetadataItem = getMockObjectMetadataItemOrThrow('person');

const companyNameField = companyObjectMetadataItem.fields.find(
  (field) => field.name === 'name',
)!;
const companyPeopleField = companyObjectMetadataItem.fields.find(
  (field) => field.name === 'people',
)!;
const personJobTitleField = personObjectMetadataItem.fields.find(
  (field) => field.name === 'jobTitle',
)!;

const initialRecordFilter: RecordFilter = {
  id: RECORD_FILTER_ID,
  fieldMetadataId: companyNameField.id,
  type: 'TEXT',
  operand: RecordFilterOperand.CONTAINS,
  value: '',
  displayValue: '',
  label: companyNameField.label,
  recordFilterGroupId: 'record-filter-group-id',
  positionInRecordFilterGroup: 0,
};

const BaseWrapper = getJestMetadataAndApolloMocksWrapper({ apolloMocks: [] });

const SeedRecordFilter = ({ children }: { children: ReactNode }) => {
  const setCurrentRecordFilters = useSetAtomComponentState(
    currentRecordFiltersComponentState,
  );
  const [isSeeded, setIsSeeded] = useState(false);

  useEffect(() => {
    setCurrentRecordFilters([initialRecordFilter]);
    setIsSeeded(true);
  }, [setCurrentRecordFilters]);

  return isSeeded ? <>{children}</> : null;
};

const getSavedRecordFilter = () =>
  jotaiStore
    .get(
      currentRecordFiltersComponentState.atomFamily({
        instanceId: RECORD_FILTERS_INSTANCE_ID,
      }),
    )
    .find((recordFilter) => recordFilter.id === RECORD_FILTER_ID);

const openPeopleRelationPage = async () => {
  const user = userEvent.setup();

  render(
    <BaseWrapper>
      <AdvancedFilterContext.Provider
        value={{ objectMetadataItem: companyObjectMetadataItem }}
      >
        <ObjectFilterDropdownComponentInstanceContext.Provider
          value={{
            instanceId:
              getAdvancedFilterObjectFilterDropdownComponentInstanceId(
                RECORD_FILTER_ID,
              ),
          }}
        >
          <SeedRecordFilter>
            <AdvancedFilterFieldSelectDropdownButton
              recordFilterId={RECORD_FILTER_ID}
            />
          </SeedRecordFilter>
        </ObjectFilterDropdownComponentInstanceContext.Provider>
      </AdvancedFilterContext.Provider>
    </BaseWrapper>,
  );

  await user.click(await screen.findByText(companyNameField.label));
  await user.click(await screen.findByText(companyPeopleField.label));

  return user;
};

describe('AdvancedFilterFieldSelectDropdownButton on a one-to-many relation', () => {
  it('saves has any as IS_NOT_EMPTY on the relation itself', async () => {
    const user = await openPeopleRelationPage();

    await user.click(
      await screen.findByText(
        `Has any ${personObjectMetadataItem.labelPlural}`,
      ),
    );

    await waitFor(() => {
      expect(getSavedRecordFilter()).toMatchObject({
        fieldMetadataId: companyPeopleField.id,
        type: 'RELATION',
        operand: RecordFilterOperand.IS_NOT_EMPTY,
        subFieldName: null,
        relationTargetFieldMetadataId: null,
      });
    });
  });

  it('saves has no as IS_EMPTY on the relation itself', async () => {
    const user = await openPeopleRelationPage();

    await user.click(
      await screen.findByText(`Has no ${personObjectMetadataItem.labelPlural}`),
    );

    await waitFor(() => {
      expect(getSavedRecordFilter()).toMatchObject({
        fieldMetadataId: companyPeopleField.id,
        operand: RecordFilterOperand.IS_EMPTY,
        subFieldName: null,
        relationTargetFieldMetadataId: null,
      });
    });
  });

  it('keeps the target field in relationTargetFieldMetadataId, never in subFieldName', async () => {
    const user = await openPeopleRelationPage();

    await user.click(await screen.findByText(personJobTitleField.label));

    await waitFor(() => {
      expect(getSavedRecordFilter()).toMatchObject({
        fieldMetadataId: companyPeopleField.id,
        type: 'TEXT',
        subFieldName: null,
        relationTargetFieldMetadataId: personJobTitleField.id,
      });
    });
  });
});
