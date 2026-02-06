import { Action } from '@/action-menu/actions/components/Action';
import { ActionConfigContext } from '@/action-menu/contexts/ActionConfigContext';
import { useContextStoreObjectMetadataItemOrThrow } from '@/context-store/hooks/useContextStoreObjectMetadataItemOrThrow';
import { useCreateNewIndexRecord } from '@/object-record/record-table/hooks/useCreateNewIndexRecord';
import { useContext } from 'react';

export const CreateNewIndexRecordNoSelectionRecordAction = () => {
  const { objectMetadataItem } = useContextStoreObjectMetadataItemOrThrow();
  const actionConfig = useContext(ActionConfigContext);

  const { createNewIndexRecord } = useCreateNewIndexRecord({
    objectMetadataItem,
  });

  const modifiedConfig = actionConfig
    ? {
        ...actionConfig,
        shortLabel: `Create ${objectMetadataItem.labelSingular}`,
      }
    : null;

  return (
    <ActionConfigContext.Provider value={modifiedConfig}>
      <Action
        onClick={() => createNewIndexRecord({ position: 'first' })}
        closeSidePanelOnCommandMenuListActionExecution={false}
      />
    </ActionConfigContext.Provider>
  );
};
