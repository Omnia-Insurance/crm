import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useEffect, useState } from 'react';

import { AdvancedFilterSidePanelRecordFilterOperandSelect } from '@/object-record/advanced-filter/side-panel/components/AdvancedFilterSidePanelRecordFilterOperandSelect';
import { AdvancedFilterContext } from '@/object-record/advanced-filter/states/context/AdvancedFilterContext';
import { getAdvancedFilterObjectFilterDropdownComponentInstanceId } from '@/object-record/advanced-filter/utils/getAdvancedFilterObjectFilterDropdownComponentInstanceId';
import { ObjectFilterDropdownComponentInstanceContext } from '@/object-record/object-filter-dropdown/states/contexts/ObjectFilterDropdownComponentInstanceContext';
import { currentRecordFiltersComponentState } from '@/object-record/record-filter/states/currentRecordFiltersComponentState';
import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import { useSetAtomComponentState } from '@/ui/utilities/state/jotai/hooks/useSetAtomComponentState';
import { mapViewFiltersToFilters } from '@/views/utils/mapViewFiltersToFilters';
import { RecordFilterOperand } from 'twenty-shared/types';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

const RECORD_FILTER_ID = 'workflow-one-to-many-filter';

const companyObjectMetadataItem = getMockObjectMetadataItemOrThrow('company');
const personObjectMetadataItem = getMockObjectMetadataItemOrThrow('person');

const companyPeopleField = companyObjectMetadataItem.fields.find(
  (field) => field.name === 'people',
)!;
const personJobTitleField = personObjectMetadataItem.fields.find(
  (field) => field.name === 'jobTitle',
)!;

const buildPeopleRecordFilter = ({
  operand,
  subFieldName = null,
  relationTargetFieldMetadataId = null,
}: {
  operand: RecordFilterOperand;
  subFieldName?: string | null;
  relationTargetFieldMetadataId?: string | null;
}): RecordFilter => {
  const [recordFilter] = mapViewFiltersToFilters(
    [
      {
        id: RECORD_FILTER_ID,
        fieldMetadataId: companyPeopleField.id,
        operand,
        value: '',
        subFieldName,
        relationTargetFieldMetadataId,
      },
    ],
    [...companyObjectMetadataItem.fields, ...personObjectMetadataItem.fields],
  );

  return { ...recordFilter, recordFilterGroupId: 'record-filter-group-id' };
};

const BaseWrapper = getJestMetadataAndApolloMocksWrapper({ apolloMocks: [] });

const SeedRecordFilter = ({
  recordFilter,
  children,
}: {
  recordFilter: RecordFilter;
  children: ReactNode;
}) => {
  const setCurrentRecordFilters = useSetAtomComponentState(
    currentRecordFiltersComponentState,
  );
  const [isSeeded, setIsSeeded] = useState(false);

  useEffect(() => {
    setCurrentRecordFilters([recordFilter]);
    setIsSeeded(true);
  }, [recordFilter, setCurrentRecordFilters]);

  return isSeeded ? <>{children}</> : null;
};

const openOperandSelect = async ({
  recordFilter,
  selectedOperandLabel,
}: {
  recordFilter: RecordFilter;
  selectedOperandLabel: string;
}) => {
  const user = userEvent.setup();

  render(
    <BaseWrapper>
      <AdvancedFilterContext.Provider
        value={{
          objectMetadataItem: companyObjectMetadataItem,
          isWorkflowFindRecords: true,
        }}
      >
        <ObjectFilterDropdownComponentInstanceContext.Provider
          value={{
            instanceId:
              getAdvancedFilterObjectFilterDropdownComponentInstanceId(
                RECORD_FILTER_ID,
              ),
          }}
        >
          <SeedRecordFilter recordFilter={recordFilter}>
            <AdvancedFilterSidePanelRecordFilterOperandSelect
              recordFilterId={RECORD_FILTER_ID}
            />
          </SeedRecordFilter>
        </ObjectFilterDropdownComponentInstanceContext.Provider>
      </AdvancedFilterContext.Provider>
    </BaseWrapper>,
  );

  await user.click(await screen.findByText(selectedOperandLabel));

  return within(await screen.findByRole('dialog', { name: 'Select operand' }));
};

describe('AdvancedFilterSidePanelRecordFilterOperandSelect on a one-to-many relation', () => {
  it('offers only has any / has no on the relation itself', async () => {
    const operandList = await openOperandSelect({
      recordFilter: buildPeopleRecordFilter({
        operand: RecordFilterOperand.IS_EMPTY,
      }),
      selectedOperandLabel: 'Is empty',
    });

    expect(operandList.getByText('Is not empty')).toBeInTheDocument();
    expect(operandList.queryByText('Is')).not.toBeInTheDocument();
  });

  it('renders a legacy workflow filter that kept the target field name in subFieldName', async () => {
    const operandList = await openOperandSelect({
      recordFilter: buildPeopleRecordFilter({
        operand: RecordFilterOperand.IS,
        subFieldName: personJobTitleField.name,
      }),
      selectedOperandLabel: 'Is',
    });

    expect(operandList.getByText('Is empty')).toBeInTheDocument();
    expect(operandList.getByText('Is not empty')).toBeInTheDocument();
    expect(operandList.queryByText('Is not')).not.toBeInTheDocument();
  });

  it('offers the target field operands when traversing to a target field', async () => {
    const operandList = await openOperandSelect({
      recordFilter: buildPeopleRecordFilter({
        operand: RecordFilterOperand.CONTAINS,
        relationTargetFieldMetadataId: personJobTitleField.id,
      }),
      selectedOperandLabel: 'Contains',
    });

    expect(operandList.getByText("Doesn't contain")).toBeInTheDocument();
  });
});
