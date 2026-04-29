// OMNIA-CUSTOM: Source the object metadata from RecordIndexContext instead of
// the URL `objectNamePlural` param. The reconciliation review page reuses this
// hook on a custom route that doesn't expose `:objectNamePlural`, but does
// provide a synthesized RecordIndexContext. This change is also safer for the
// stock table view — it stops relying on URL state that any future route
// rename or wrapper component could break.

import { useRecordIndexContextOrThrow } from '@/object-record/record-index/contexts/RecordIndexContext';

export const DEFAULT_SEARCH_REQUEST_LIMIT = 60;

export const useOptionsForSelect = (fieldMetadataId: string) => {
  const { objectMetadataItem } = useRecordIndexContextOrThrow();

  const fieldMetadataItem = objectMetadataItem.readableFields.find(
    (field) => field.id === fieldMetadataId,
  );

  const selectOptions = fieldMetadataItem?.options;

  return {
    selectOptions,
  };
};
