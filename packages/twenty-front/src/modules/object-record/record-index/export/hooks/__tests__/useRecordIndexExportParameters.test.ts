import { type ContextStoreTargetedRecordsRule } from '@/context-store/states/contextStoreTargetedRecordsRuleComponentState';
import { currentRecordFieldsComponentState } from '@/object-record/record-field/states/currentRecordFieldsComponentState';
import { useRecordIndexExportParameters } from '@/object-record/record-index/export/hooks/useRecordIndexExportParameters';
import { renderHook } from '@testing-library/react';
import { getJestMetadataAndApolloMocksAndCommandMenuWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksAndCommandMenuWrapper';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

jest.mock(
  '@/object-record/record-index/hooks/useFindManyRecordIndexTableParams',
  () => ({
    useFindManyRecordIndexTableParams: () => ({
      filter: { city: { eq: 'Paris' } },
      orderBy: [{ city: 'AscNullsFirst' }],
    }),
  }),
);

jest.mock(
  '@/object-record/object-options-dropdown/hooks/useObjectOptionsForBoard',
  () => ({
    useObjectOptionsForBoard: () => ({ hiddenBoardFields: [] }),
  }),
);

describe('useRecordIndexExportParameters', () => {
  const objectMetadataItem = getMockObjectMetadataItemOrThrow('person');
  const name = objectMetadataItem.fields.find(
    (field) => field.name === 'name',
  )!;
  const city = objectMetadataItem.fields.find(
    (field) => field.name === 'city',
  )!;
  const email = objectMetadataItem.fields.find(
    (field) => field.name === 'emails',
  )!;

  const exportParameters = (selection: ContextStoreTargetedRecordsRule) => {
    const wrapper = getJestMetadataAndApolloMocksAndCommandMenuWrapper({
      apolloMocks: [],
      componentInstanceId: 'recordIndexId',
      contextStoreTargetedRecordsRule: selection,
      contextStoreCurrentObjectMetadataNameSingular: 'person',
      onInitializeJotaiStore: (store) => {
        store.set(
          currentRecordFieldsComponentState.atomFamily({
            instanceId: 'recordIndexId',
          }),
          [
            {
              id: 'name-column',
              fieldMetadataItemId: name.id,
              position: 1,
              isVisible: true,
              size: 100,
            },
            {
              id: 'city-column',
              fieldMetadataItemId: city.id,
              position: 0,
              isVisible: true,
              size: 100,
            },
            {
              id: 'email-column',
              fieldMetadataItemId: email.id,
              position: 2,
              isVisible: false,
              size: 100,
            },
          ],
        );
      },
    });
    return renderHook(
      () =>
        useRecordIndexExportParameters({
          objectMetadataItem,
          recordIndexId: 'recordIndexId',
        }),
      { wrapper },
    ).result;
  };

  it('captures the current view filter, sort and visible column order', () => {
    const result = exportParameters({
      mode: 'selection',
      selectedRecordIds: [],
    });
    expect(result.current).toEqual({
      objectMetadataId: objectMetadataItem.id,
      filter: { city: { eq: 'Paris' } },
      orderBy: [{ city: 'AscNullsFirst' }],
      fieldMetadataIds: [city.id, name.id],
      // OMNIA-CUSTOM: relation sub-field columns travel separately (contract C6)
      relationSubFields: [],
    });
  });

  it('exports only explicitly selected records', () => {
    const result = exportParameters({
      mode: 'selection',
      selectedRecordIds: ['first', 'second'],
    });
    expect(result.current.filter).toEqual({ id: { in: ['first', 'second'] } });
  });

  it('preserves exclusions when all records are selected', () => {
    const result = exportParameters({
      mode: 'exclusion',
      excludedRecordIds: ['excluded'],
    });
    expect(result.current.filter).toEqual({
      and: expect.arrayContaining([{ not: { id: { in: ['excluded'] } } }]),
    });
  });
});

// OMNIA-CUSTOM: relation sub-field columns ("Lead / Date of Birth") travel as relationSubFields (contract C6)
describe('useRecordIndexExportParameters with relation sub-field columns', () => {
  const objectMetadataItem = getMockObjectMetadataItemOrThrow('person');
  const findPersonField = (fieldName: string) =>
    objectMetadataItem.fields.find((field) => field.name === fieldName)!;
  const name = findPersonField('name');
  const city = findPersonField('city');
  const company = findPersonField('company');
  const opportunities = findPersonField('pointOfContactForOpportunities');

  const exportParametersFor = (
    columns: { fieldMetadataItemId: string; subFieldName?: string }[],
  ) => {
    const wrapper = getJestMetadataAndApolloMocksAndCommandMenuWrapper({
      apolloMocks: [],
      componentInstanceId: 'recordIndexId',
      contextStoreTargetedRecordsRule: {
        mode: 'selection',
        selectedRecordIds: [],
      },
      contextStoreCurrentObjectMetadataNameSingular: 'person',
      onInitializeJotaiStore: (store) => {
        store.set(
          currentRecordFieldsComponentState.atomFamily({
            instanceId: 'recordIndexId',
          }),
          columns.map((column, position) => ({
            id: `column-${position}`,
            position,
            isVisible: true,
            size: 100,
            ...column,
          })),
        );
      },
    });

    return renderHook(
      () =>
        useRecordIndexExportParameters({
          objectMetadataItem,
          recordIndexId: 'recordIndexId',
        }),
      { wrapper },
    ).result.current;
  };

  it('sends a relation id once, at its first column, with each of its sub-field columns', () => {
    const { fieldMetadataIds, relationSubFields } = exportParametersFor([
      { fieldMetadataItemId: name.id },
      { fieldMetadataItemId: company.id, subFieldName: 'name' },
      { fieldMetadataItemId: city.id },
      { fieldMetadataItemId: company.id },
      { fieldMetadataItemId: company.id, subFieldName: 'employees' },
    ]);

    expect(fieldMetadataIds).toEqual([name.id, company.id, city.id]);
    expect(relationSubFields).toEqual([
      { fieldMetadataId: company.id, subFieldName: 'name' },
      { fieldMetadataId: company.id, subFieldName: 'employees' },
    ]);
  });

  it('places a relation shown only through sub-field columns at its first one', () => {
    const { fieldMetadataIds, relationSubFields } = exportParametersFor([
      { fieldMetadataItemId: city.id },
      { fieldMetadataItemId: company.id, subFieldName: 'domainName' },
      { fieldMetadataItemId: name.id },
    ]);

    expect(fieldMetadataIds).toEqual([city.id, company.id, name.id]);
    expect(relationSubFields).toEqual([
      { fieldMetadataId: company.id, subFieldName: 'domainName' },
    ]);
  });

  it('never sends a one-to-many back-reference to the exported object', () => {
    const { fieldMetadataIds, relationSubFields } = exportParametersFor([
      { fieldMetadataItemId: name.id },
      { fieldMetadataItemId: company.id, subFieldName: 'people' },
      { fieldMetadataItemId: company.id, subFieldName: 'name' },
    ]);

    expect(fieldMetadataIds).toEqual([name.id, company.id]);
    expect(relationSubFields).toEqual([
      { fieldMetadataId: company.id, subFieldName: 'name' },
    ]);
  });

  it('skips sub-field columns the server cannot export', () => {
    const { fieldMetadataIds, relationSubFields } = exportParametersFor([
      { fieldMetadataItemId: name.id },
      { fieldMetadataItemId: company.id, subFieldName: 'removedField' },
      { fieldMetadataItemId: opportunities.id, subFieldName: 'name' },
    ]);

    expect(fieldMetadataIds).toEqual([name.id]);
    expect(relationSubFields).toEqual([]);
  });
});
