import { useEffect, type PropsWithChildren } from 'react';
import { useStore } from 'jotai';

import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { useColumnDefinitionsFromObjectMetadata } from '@/object-metadata/hooks/useColumnDefinitionsFromObjectMetadata';
import { RecordComponentInstanceContextsWrapper } from '@/object-record/components/RecordComponentInstanceContextsWrapper';
import { RecordIndexContextProvider } from '@/object-record/record-index/contexts/RecordIndexContext';
import { useRecordIndexFieldMetadataDerivedStates } from '@/object-record/record-index/hooks/useRecordIndexFieldMetadataDerivedStates';
import { ViewComponentInstanceContext } from '@/views/states/contexts/ViewComponentInstanceContext';
import { useInitViewBar } from '@/views/hooks/useInitViewBar';
import { useUpsertRecordFilter } from '@/object-record/record-filter/hooks/useUpsertRecordFilter';
import { currentRecordFiltersComponentState } from '@/object-record/record-filter/states/currentRecordFiltersComponentState';
import { type RecordFilter } from '@/object-record/record-filter/types/RecordFilter';
import { useAtomComponentStateCallbackState } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateCallbackState';
import { FieldMetadataType } from '~/generated-metadata/graphql';
import { ViewFilterOperand } from 'twenty-shared/types';
import { v4 } from 'uuid';

type Props = PropsWithChildren<{
  viewBarId: string;
  reviewItemMetadata: EnrichedObjectMetadataItem;
}>;

const ReconciliationFilterBarInitEffect = ({
  viewBarId,
  reviewItemMetadata,
}: {
  viewBarId: string;
  reviewItemMetadata: EnrichedObjectMetadataItem;
}) => {
  const { columnDefinitions } =
    useColumnDefinitionsFromObjectMetadata(reviewItemMetadata);

  const { setViewObjectMetadataId, setAvailableFieldDefinitions } =
    useInitViewBar(viewBarId);

  const { upsertRecordFilter } = useUpsertRecordFilter(viewBarId);

  // Read the live filters atom inside the seeding effect so the seed is
  // idempotent against the actual current state — not against component-
  // local state. React 18 StrictMode runs effects twice in dev, and a
  // useState/useRef guard captures `false` in both closures, leading to
  // duplicate chips. Atom-based check works regardless of how many times
  // the effect fires.
  const filtersAtom = useAtomComponentStateCallbackState(
    currentRecordFiltersComponentState,
    viewBarId,
  );
  const store = useStore();

  useEffect(() => {
    setViewObjectMetadataId?.(reviewItemMetadata.id);
    setAvailableFieldDefinitions?.(columnDefinitions);
  }, [
    setViewObjectMetadataId,
    setAvailableFieldDefinitions,
    reviewItemMetadata.id,
    columnDefinitions,
  ]);

  // Seed the view with a default `flags contains STATUS_CHANGE` filter
  // when the filter list is empty. STATUS_CHANGE rows are the audit-
  // relevant ones (a CRM policy moved between PLACED / APPROVED /
  // CANCELED / payment-error states). Everything else is data hygiene
  // that doesn't need eyeball attention.
  //
  // We only seed when the filter list is fully empty so we don't fight
  // a reviewer who's intentionally edited the filters in this session.
  // Removing the chip and refreshing the page (which clears the atom)
  // brings the default back — that's the documented behavior.
  useEffect(() => {
    const flagsField = reviewItemMetadata.fields.find(
      (f) => f.name === 'flags' && f.type === FieldMetadataType.MULTI_SELECT,
    );

    if (!flagsField) return;

    const currentFilters = store.get(filtersAtom) as RecordFilter[];

    if (currentFilters.length > 0) return;

    const value = JSON.stringify(['STATUS_CHANGE']);

    upsertRecordFilter({
      id: v4(),
      fieldMetadataId: flagsField.id,
      type: FieldMetadataType.MULTI_SELECT,
      operand: ViewFilterOperand.CONTAINS,
      value,
      displayValue: value,
      label: flagsField.label ?? 'Flags',
    });
  }, [reviewItemMetadata.fields, upsertRecordFilter, filtersAtom, store]);

  return null;
};

/**
 * Mounts the context stack that Twenty's native filter UI expects, scoped to a
 * dedicated `viewBarId` so the reconciliation review page's filter state is
 * isolated from the surrounding reconciliation show page.
 *
 * Children can read filter atoms via `useAtomComponentStateValue(state, viewBarId)`
 * and call `useUpsertRecordFilter` / `useRemoveRecordFilter`.
 */
export const ReconciliationFilterProviders = ({
  viewBarId,
  reviewItemMetadata,
  children,
}: Props) => {
  const derived = useRecordIndexFieldMetadataDerivedStates(
    reviewItemMetadata,
    viewBarId,
  );

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
            objectPermissionsByObjectMetadataId: {},
            recordIndexId: viewBarId,
            viewBarInstanceId: viewBarId,
            ...derived,
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
