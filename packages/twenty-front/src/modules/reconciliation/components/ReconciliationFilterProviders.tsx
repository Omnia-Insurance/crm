import { useStore } from 'jotai';
import { type PropsWithChildren, useEffect } from 'react';
import { ViewFilterOperand } from 'twenty-shared/types';
import { v4 } from 'uuid';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { RecordComponentInstanceContextsWrapper } from '@/object-record/components/RecordComponentInstanceContextsWrapper';
import { useObjectPermissions } from '@/object-record/hooks/useObjectPermissions';
import { useUpsertRecordFilter } from '@/object-record/record-filter/hooks/useUpsertRecordFilter';
import { currentRecordFiltersComponentState } from '@/object-record/record-filter/states/currentRecordFiltersComponentState';
import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import { RecordIndexContextProvider } from '@/object-record/record-index/contexts/RecordIndexContext';
import { useRecordIndexFieldMetadataDerivedStates } from '@/object-record/record-index/hooks/useRecordIndexFieldMetadataDerivedStates';
import { useAtomComponentStateCallbackState } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateCallbackState';
import { ViewComponentInstanceContext } from '@/views/states/contexts/ViewComponentInstanceContext';
import { FieldMetadataType } from '~/generated-metadata/graphql';

type ReconciliationFilterProvidersProps = PropsWithChildren<{
  viewBarId: string;
  reviewItemMetadata: EnrichedObjectMetadataItem;
}>;

type ReconciliationFilterBarInitEffectProps = {
  viewBarId: string;
  reviewItemMetadata: EnrichedObjectMetadataItem;
};

const ReconciliationFilterBarInitEffect = ({
  viewBarId,
  reviewItemMetadata,
}: ReconciliationFilterBarInitEffectProps) => {
  const { upsertRecordFilter } = useUpsertRecordFilter(viewBarId);

  // Reads the live atom so the seed stays idempotent when StrictMode runs the
  // effect twice; a local ref guard would add the chip twice.
  const filtersAtom = useAtomComponentStateCallbackState(
    currentRecordFiltersComponentState,
    viewBarId,
  );
  const store = useStore();

  // Default to `flags contains STATUS_CHANGE`, the audit-relevant rows, but
  // only on an empty filter list so a reviewer's own edits are never fought.
  useEffect(() => {
    const flagsField = reviewItemMetadata.readableFields.find(
      (field) =>
        field.name === 'flags' && field.type === FieldMetadataType.MULTI_SELECT,
    );

    if (!flagsField) {
      return;
    }

    const currentFilters = store.get(filtersAtom) as RecordFilter[];

    if (currentFilters.length > 0) {
      return;
    }

    const value = JSON.stringify(['STATUS_CHANGE']);

    upsertRecordFilter({
      id: v4(),
      fieldMetadataId: flagsField.id,
      type: FieldMetadataType.MULTI_SELECT,
      operand: ViewFilterOperand.CONTAINS,
      value,
      displayValue: value,
      label: flagsField.label,
    });
  }, [
    reviewItemMetadata.readableFields,
    upsertRecordFilter,
    filtersAtom,
    store,
  ]);

  return null;
};

// The context stack the native filter UI expects, scoped to viewBarId so the
// review's filters never leak into another filter bar on the page.
export const ReconciliationFilterProviders = ({
  viewBarId,
  reviewItemMetadata,
  children,
}: ReconciliationFilterProvidersProps) => {
  const { objectPermissionsByObjectMetadataId } = useObjectPermissions();

  const recordIndexFieldMetadataDerivedStates =
    useRecordIndexFieldMetadataDerivedStates(reviewItemMetadata, viewBarId);

  return (
    <RecordComponentInstanceContextsWrapper componentInstanceId={viewBarId}>
      <ViewComponentInstanceContext.Provider value={{ instanceId: viewBarId }}>
        <RecordIndexContextProvider
          value={{
            indexIdentifierUrl: () => '',
            onIndexRecordsLoaded: () => {},
            objectNamePlural: reviewItemMetadata.namePlural,
            objectNameSingular: reviewItemMetadata.nameSingular,
            objectMetadataItem: reviewItemMetadata,
            objectPermissionsByObjectMetadataId,
            recordIndexId: viewBarId,
            viewBarInstanceId: viewBarId,
            ...recordIndexFieldMetadataDerivedStates,
          }}
        >
          <ReconciliationFilterBarInitEffect
            viewBarId={viewBarId}
            reviewItemMetadata={reviewItemMetadata}
          />
          {children}
        </RecordIndexContextProvider>
      </ViewComponentInstanceContext.Provider>
    </RecordComponentInstanceContextsWrapper>
  );
};
