import { styled } from '@linaria/react';

import { CommandMenuComponentInstanceContext } from '@/command-menu/states/contexts/CommandMenuComponentInstanceContext';
import { ContextStoreComponentInstanceContext } from '@/context-store/states/contexts/ContextStoreComponentInstanceContext';
import { MAIN_CONTEXT_STORE_INSTANCE_ID } from '@/context-store/constants/MainContextStoreInstanceId';
import { contextStoreCurrentObjectMetadataItemIdComponentState } from '@/context-store/states/contextStoreCurrentObjectMetadataItemIdComponentState';
import { contextStoreCurrentViewIdComponentState } from '@/context-store/states/contextStoreCurrentViewIdComponentState';
import { objectMetadataItemFamilySelector } from '@/object-metadata/states/objectMetadataItemFamilySelector';
import { RecordComponentInstanceContextsWrapper } from '@/object-record/components/RecordComponentInstanceContextsWrapper';
import { RecordIndexContextProvider } from '@/object-record/record-index/contexts/RecordIndexContext';
import { useRecordIndexFieldMetadataDerivedStates } from '@/object-record/record-index/hooks/useRecordIndexFieldMetadataDerivedStates';
import { RecordTableWithWrappers } from '@/object-record/record-table/components/RecordTableWithWrappers';
import { SignInBackgroundMockContainerEffect } from '@/sign-in-background-mock/components/SignInBackgroundMockContainerEffect';
import { SIGN_IN_BACKGROUND_MOCK_CONFIG } from '@/sign-in-background-mock/constants/SignInBackgroundMockConfig';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useAtomFamilySelectorValue } from '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue';
import { ViewBar } from '@/views/components/ViewBar';
import { viewObjectMetadataIdComponentState } from '@/views/states/viewObjectMetadataIdComponentState';
import { ViewComponentInstanceContext } from '@/views/states/contexts/ViewComponentInstanceContext';
import { viewsSelector } from '@/views/states/selectors/viewsSelector';
import { isDefined } from 'twenty-shared/utils';
import { ViewKey } from '~/generated-metadata/graphql';

const StyledContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto;
`;

export const SignInBackgroundMockContainer = () => {
  const objectMetadataItem = useAtomFamilySelectorValue(
    objectMetadataItemFamilySelector,
    {
      objectName: SIGN_IN_BACKGROUND_MOCK_CONFIG.objectNamePlural,
      objectNameType: 'plural',
    },
  );
  const views = useAtomStateValue(viewsSelector);

  const currentView = views.find(
    (view) =>
      view.objectMetadataId === objectMetadataItem?.id &&
      view.key === ViewKey.INDEX,
  );
  const contextStoreCurrentObjectMetadataItemId = useAtomComponentStateValue(
    contextStoreCurrentObjectMetadataItemIdComponentState,
    MAIN_CONTEXT_STORE_INSTANCE_ID,
  );
  const contextStoreCurrentViewId = useAtomComponentStateValue(
    contextStoreCurrentViewIdComponentState,
    MAIN_CONTEXT_STORE_INSTANCE_ID,
  );
  const viewObjectMetadataId = useAtomComponentStateValue(
    viewObjectMetadataIdComponentState,
    SIGN_IN_BACKGROUND_MOCK_CONFIG.viewBarId,
  );

  const {
    fieldDefinitionByFieldMetadataItemId,
    fieldMetadataItemByFieldMetadataItemId,
    labelIdentifierFieldMetadataItem,
    recordFieldByFieldMetadataItemId,
  } = useRecordIndexFieldMetadataDerivedStates(
    objectMetadataItem ?? undefined,
    SIGN_IN_BACKGROUND_MOCK_CONFIG.recordIndexId,
  );

  if (!isDefined(objectMetadataItem) || !isDefined(currentView)) {
    return <StyledContainer />;
  }

  const isViewBarReady =
    contextStoreCurrentObjectMetadataItemId === objectMetadataItem.id &&
    contextStoreCurrentViewId === currentView.id &&
    viewObjectMetadataId === objectMetadataItem.id;

  return (
    <StyledContainer>
      <RecordIndexContextProvider
        value={{
          objectPermissionsByObjectMetadataId: {},
          recordIndexId: SIGN_IN_BACKGROUND_MOCK_CONFIG.recordIndexId,
          viewBarInstanceId: SIGN_IN_BACKGROUND_MOCK_CONFIG.viewBarId,
          objectNamePlural: SIGN_IN_BACKGROUND_MOCK_CONFIG.objectNamePlural,
          objectNameSingular: SIGN_IN_BACKGROUND_MOCK_CONFIG.objectNameSingular,
          objectMetadataItem,
          onIndexRecordsLoaded: () => {},
          indexIdentifierUrl: () => '',
          fieldDefinitionByFieldMetadataItemId,
          fieldMetadataItemByFieldMetadataItemId,
          labelIdentifierFieldMetadataItem,
          recordFieldByFieldMetadataItemId,
        }}
      >
        <ViewComponentInstanceContext.Provider
          value={{ instanceId: SIGN_IN_BACKGROUND_MOCK_CONFIG.viewBarId }}
        >
          <RecordComponentInstanceContextsWrapper
            componentInstanceId={SIGN_IN_BACKGROUND_MOCK_CONFIG.recordIndexId}
          >
            <ContextStoreComponentInstanceContext.Provider
              value={{
                instanceId: MAIN_CONTEXT_STORE_INSTANCE_ID,
              }}
            >
              <SignInBackgroundMockContainerEffect
                objectMetadataItemId={objectMetadataItem.id}
                recordTableId={SIGN_IN_BACKGROUND_MOCK_CONFIG.recordIndexId}
                viewBarId={SIGN_IN_BACKGROUND_MOCK_CONFIG.viewBarId}
              />
              <CommandMenuComponentInstanceContext.Provider
                value={{
                  instanceId: SIGN_IN_BACKGROUND_MOCK_CONFIG.recordIndexId,
                }}
              >
                {isViewBarReady ? (
                  <>
                    <ViewBar
                      viewBarId={SIGN_IN_BACKGROUND_MOCK_CONFIG.viewBarId}
                      optionsDropdownButton={<></>}
                      isReadOnly
                    />

                    <RecordTableWithWrappers
                      objectNameSingular={
                        SIGN_IN_BACKGROUND_MOCK_CONFIG.objectNameSingular
                      }
                      recordTableId={
                        SIGN_IN_BACKGROUND_MOCK_CONFIG.recordIndexId
                      }
                      viewBarId={SIGN_IN_BACKGROUND_MOCK_CONFIG.viewBarId}
                    />
                  </>
                ) : null}
              </CommandMenuComponentInstanceContext.Provider>
            </ContextStoreComponentInstanceContext.Provider>
          </RecordComponentInstanceContextsWrapper>
        </ViewComponentInstanceContext.Provider>
      </RecordIndexContextProvider>
    </StyledContainer>
  );
};
