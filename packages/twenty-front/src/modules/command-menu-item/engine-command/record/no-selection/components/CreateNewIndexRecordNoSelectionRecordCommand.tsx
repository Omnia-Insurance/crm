import { HeadlessEngineCommandWrapperEffect } from '@/command-menu-item/engine-command/components/HeadlessEngineCommandWrapperEffect';
import { useHeadlessCommandContextApi } from '@/command-menu-item/engine-command/hooks/useHeadlessCommandContextApi';
import { useCreateNewIndexRecord } from '@/object-record/record-table/hooks/useCreateNewIndexRecord';
import { isDefined } from 'twenty-shared/utils';

export const CreateNewIndexRecordNoSelectionRecordCommand = () => {
  const { objectMetadataItem, recordIndexId } = useHeadlessCommandContextApi();

  if (!isDefined(objectMetadataItem) || !isDefined(recordIndexId)) {
    throw new Error(
      'Object metadata item and record index ID are required to create new index record',
    );
  }

  const { openDraftInSidePanel } = useCreateNewIndexRecord({
    objectMetadataItem,
    instanceId: recordIndexId,
  });

  return (
    <HeadlessEngineCommandWrapperEffect
      execute={() => openDraftInSidePanel({ position: 'first' })}
    />
  );
};
