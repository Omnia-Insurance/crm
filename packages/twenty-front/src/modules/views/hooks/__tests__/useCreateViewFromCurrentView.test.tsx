import { type MockedResponse } from '@apollo/client/testing';
import { act, renderHook } from '@testing-library/react';
import { isDefined } from 'twenty-shared/utils';

import { useCreateViewFromCurrentView } from '@/views/hooks/useCreateViewFromCurrentView';
import { type ViewWithRelations } from '@/views/types/ViewWithRelations';
import {
  CreateManyViewFieldsDocument,
  type CreateManyViewFieldsMutation,
  type CreateManyViewFieldsMutationVariables,
  CreateViewDocument,
  type CreateViewMutation,
  type CreateViewMutationVariables,
  ViewType,
  ViewVisibility,
} from '~/generated-metadata/graphql';
import { getJestMetadataAndApolloMocksAndCommandMenuWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksAndCommandMenuWrapper';
import { mockedViews } from '~/testing/mock-data/generated/metadata/views/mock-views-data';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';
import { setTestViewsInMetadataStore } from '~/testing/utils/setTestViewsInMetadataStore';

const NEW_VIEW_ID = 'c5f1a8e2-3b4d-4e6f-8a9b-0c1d2e3f4a5b';

const accountOwnerFieldMetadataItem = getMockObjectMetadataItemOrThrow(
  'company',
).fields.find((field) => field.name === 'accountOwner');

const allCompaniesView = mockedViews.find(
  (view) => view.name === 'All Companies',
);

if (!isDefined(accountOwnerFieldMetadataItem) || !isDefined(allCompaniesView)) {
  throw new Error('Missing "accountOwner" field or "All Companies" view mock');
}

const sourceView: ViewWithRelations = {
  ...allCompaniesView,
  viewFields: [
    {
      id: 'account-owner-view-field-id',
      viewId: allCompaniesView.id,
      fieldMetadataId: accountOwnerFieldMetadataItem.id,
      position: 1,
      size: 150,
      isVisible: true,
      isActive: true,
      subFieldName: null,
    },
    {
      id: 'account-owner-email-view-field-id',
      viewId: allCompaniesView.id,
      fieldMetadataId: accountOwnerFieldMetadataItem.id,
      position: 2,
      size: 180,
      isVisible: true,
      isActive: true,
      subFieldName: 'userEmail',
    },
  ],
};

const createdView: CreateViewMutation['createView'] = {
  __typename: 'View',
  id: NEW_VIEW_ID,
  name: 'All Companies copy',
  objectMetadataId: allCompaniesView.objectMetadataId,
  type: ViewType.TABLE,
  key: null,
  icon: allCompaniesView.icon,
  position: 1,
  isCompact: false,
  kanbanAggregateOperation: null,
  kanbanAggregateOperationFieldMetadataId: null,
  mainGroupByFieldMetadataId: null,
  shouldHideEmptyGroups: false,
  shouldDisplayGroupsAsTabs: null,
  kanbanColumnWidth: null,
  groupLoadLimit: null,
  anyFieldFilterValue: null,
  calendarFieldMetadataId: null,
  calendarEndFieldMetadataId: null,
  calendarLayout: null,
  visibility: ViewVisibility.WORKSPACE,
  createdByUserWorkspaceId: null,
  applicationId: '0f7c2b8e-6d1a-4c3b-9e5f-1a2b3c4d5e6f',
  universalIdentifier: '7d3e9f1a-2b4c-4d5e-8f6a-9b0c1d2e3f4a',
  isActive: true,
  viewFields: [],
  viewFieldGroups: [],
  viewFilters: [],
  viewFilterGroups: [],
  viewSorts: [],
  viewGroups: [],
};

const createViewMock: MockedResponse<
  CreateViewMutation,
  CreateViewMutationVariables
> = {
  request: { query: CreateViewDocument, variables: () => true },
  result: { data: { createView: createdView } },
};

describe('useCreateViewFromCurrentView', () => {
  it('should copy relation sub-field columns with their subFieldName', async () => {
    const createManyViewFieldsResult = jest.fn(
      (_variables: CreateManyViewFieldsMutationVariables) => ({
        data: {
          createManyViewFields: [],
        } satisfies CreateManyViewFieldsMutation,
      }),
    );

    const createManyViewFieldsMock: MockedResponse<
      CreateManyViewFieldsMutation,
      CreateManyViewFieldsMutationVariables
    > = {
      request: { query: CreateManyViewFieldsDocument, variables: () => true },
      result: createManyViewFieldsResult,
    };

    const { result } = renderHook(() => useCreateViewFromCurrentView(), {
      wrapper: getJestMetadataAndApolloMocksAndCommandMenuWrapper({
        apolloMocks: [createViewMock, createManyViewFieldsMock],
        componentInstanceId: 'instanceId',
        contextStoreCurrentObjectMetadataNameSingular: 'company',
        contextStoreCurrentViewId: sourceView.id,
        onInitializeJotaiStore: (store) => {
          setTestViewsInMetadataStore(store, [sourceView]);
        },
      }),
    });

    let newViewId: string | undefined;

    await act(async () => {
      newViewId = await result.current.createViewFromCurrentView({
        id: NEW_VIEW_ID,
        name: createdView.name,
      });
    });

    expect(newViewId).toBe(NEW_VIEW_ID);
    expect(createManyViewFieldsResult).toHaveBeenCalledTimes(1);

    const [{ inputs }] = createManyViewFieldsResult.mock.calls[0];

    const copiedColumns = (Array.isArray(inputs) ? inputs : [inputs]).map(
      ({ fieldMetadataId, subFieldName, viewId }) => ({
        fieldMetadataId,
        subFieldName: subFieldName ?? null,
        viewId,
      }),
    );

    expect(copiedColumns).toEqual([
      {
        fieldMetadataId: accountOwnerFieldMetadataItem.id,
        subFieldName: null,
        viewId: NEW_VIEW_ID,
      },
      {
        fieldMetadataId: accountOwnerFieldMetadataItem.id,
        subFieldName: 'userEmail',
        viewId: NEW_VIEW_ID,
      },
    ]);
  });
});
