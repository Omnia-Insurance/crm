import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { getLabelIdentifierFieldMetadataItem } from '@/object-metadata/utils/getLabelIdentifierFieldMetadataItem';
import { useBuildRecordInputFromRLSPredicates } from '@/object-record/hooks/useBuildRecordInputFromRLSPredicates';
import { useRecordCreationForm } from '@/object-record/record-form/hooks/useRecordCreationForm';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { getFieldMetadataItemGqlFieldName } from '@/object-metadata/utils/getFieldMetadataItemGqlFieldName';
import { useResolveOpenRecordIn } from '@/object-record/record-index/hooks/useResolveOpenRecordIn';
import { useUpsertRecordsInStore } from '@/object-record/record-store/hooks/useUpsertRecordsInStore';
import { newRecordTitleCellToOpenState } from '@/object-record/record-title-cell/states/newRecordTitleCellToOpenState';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { type OnRecordCreated } from '@/object-record/types/OnRecordCreated';
// OMNIA-CUSTOM: reconciliation create opens the run wizard
import { useOpenReconciliationWizard } from '@/reconciliation/hooks/useOpenReconciliationWizard';
import { isSidePanelOpenedState } from '@/side-panel/states/isSidePanelOpenedState';
import { sidePanelNavigationStackState } from '@/side-panel/states/sidePanelNavigationStackState';
import { useOpenRecordInSidePanel } from '@/side-panel/hooks/useOpenRecordInSidePanel';
import { useSidePanelMenu } from '@/side-panel/hooks/useSidePanelMenu';
import { useWorkspaceSurface } from '@/ui/layout/hooks/useWorkspaceSurface';
import { useStore } from 'jotai';
import { useCallback } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { AppPath, OpenRecordIn } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { v4 } from 'uuid';
import { useNavigateApp } from '~/hooks/useNavigateApp';

type UseCreateNewRecordProps = {
  objectMetadataItem: EnrichedObjectMetadataItem;
  buildRecordInput?: () => Partial<ObjectRecord>;
  onRecordCreated?: OnRecordCreated;
};

export const useCreateNewRecord = ({
  objectMetadataItem,
  buildRecordInput,
  onRecordCreated,
}: UseCreateNewRecordProps) => {
  const store = useStore();

  const { openRecordInSidePanel } = useOpenRecordInSidePanel();
  const workspaceSurface = useWorkspaceSurface();

  const openRecordIn = useResolveOpenRecordIn(objectMetadataItem.nameSingular);

  const { closeSidePanelMenu } = useSidePanelMenu();

  const { createOneRecord } = useCreateOneRecord({
    objectNameSingular: objectMetadataItem.nameSingular,
    shouldMatchRootQueryFilter: true,
  });

  const { upsertRecordsInStore } = useUpsertRecordsInStore();

  const { requestRecordCreation } = useRecordCreationForm();

  const navigate = useNavigateApp();

  const { buildRecordInputFromRLSPredicates } =
    useBuildRecordInputFromRLSPredicates({
      objectMetadataItem,
    });

  // OMNIA-CUSTOM: reconciliation runs start from the carrier import wizard, never a blank record
  const { openReconciliationWizard } = useOpenReconciliationWizard();
  const location = useLocation();

  const createRecord = useCallback(
    async (recordInput?: Partial<ObjectRecord>) => {
      const recordId = v4();
      const recordInputFromRLSPredicates = buildRecordInputFromRLSPredicates();
      const additionalRecordInput = buildRecordInput?.();

      const mergedRecordInput = {
        ...recordInputFromRLSPredicates,
        ...additionalRecordInput,
        ...recordInput,
      };

      const createdRecord = await createOneRecord({
        id: recordId,
        ...mergedRecordInput,
      });

      return createdRecord;
    },
    [buildRecordInputFromRLSPredicates, buildRecordInput, createOneRecord],
  );

  const createAndStoreRecord = useCallback(
    async (recordInput?: Partial<ObjectRecord>) => {
      const createdRecord = await createRecord(recordInput);

      onRecordCreated?.({ record: createdRecord, recordInput });
      upsertRecordsInStore({ partialRecords: [createdRecord] });

      return createdRecord;
    },
    [createRecord, onRecordCreated, upsertRecordsInStore],
  );

  const createNewRecord = useCallback(
    async (recordInput?: Partial<ObjectRecord>) => {
      // OMNIA-CUSTOM: the wizard's carrier picker is mounted on the reconciliation index only.
      // Commands run outside the side panel's router, so its routed page is read from the store.
      if (objectMetadataItem.nameSingular === 'reconciliation') {
        const sidePanelPathname = store.get(isSidePanelOpenedState.atom)
          ? store.get(sidePanelNavigationStackState.atom).at(-1)?.routedLocation
              ?.pathname
          : undefined;

        const isReconciliationIndexShown = [
          location.pathname,
          sidePanelPathname,
        ].some(
          (pathname) =>
            isDefined(pathname) &&
            matchPath(AppPath.RecordIndexPage, pathname)?.params
              .objectNamePlural === objectMetadataItem.namePlural,
        );

        if (!isReconciliationIndexShown) {
          navigate(AppPath.RecordIndexPage, {
            objectNamePlural: objectMetadataItem.namePlural,
          });
        }

        await openReconciliationWizard();

        return;
      }

      let submittedRecordInput = recordInput;

      const createdRecord = await requestRecordCreation({
        objectMetadataItem,
        initialDraftRecord: {
          ...buildRecordInputFromRLSPredicates(),
          ...buildRecordInput?.(),
          ...recordInput,
        },
        createRecord: (draftRecord) => {
          submittedRecordInput = { ...recordInput, ...draftRecord };
          return createAndStoreRecord(submittedRecordInput);
        },
      });

      if (!isDefined(createdRecord)) {
        return;
      }

      const recordId = createdRecord.id;

      const labelIdentifierFieldMetadataItem =
        getLabelIdentifierFieldMetadataItem(objectMetadataItem);

      const shouldOpenLabelIdentifierInEditMode =
        !isDefined(labelIdentifierFieldMetadataItem) ||
        !isDefined(
          submittedRecordInput?.[
            getFieldMetadataItemGqlFieldName(labelIdentifierFieldMetadataItem)
          ],
        );

      if (workspaceSurface.type === 'side-panel') {
        openRecordInSidePanel({
          recordId,
          objectNameSingular: objectMetadataItem.nameSingular,
          isNewRecord: shouldOpenLabelIdentifierInEditMode,
          resetNavigationStack: false,
        });
      } else if (openRecordIn === OpenRecordIn.SIDE_PANEL) {
        openRecordInSidePanel({
          recordId,
          objectNameSingular: objectMetadataItem.nameSingular,
          isNewRecord: shouldOpenLabelIdentifierInEditMode,
        });
      } else {
        if (
          shouldOpenLabelIdentifierInEditMode &&
          isDefined(labelIdentifierFieldMetadataItem)
        ) {
          store.set(newRecordTitleCellToOpenState.atom, {
            recordId,
            fieldName: labelIdentifierFieldMetadataItem.name,
          });
        }

        closeSidePanelMenu();
        navigate(AppPath.RecordShowPage, {
          objectNameSingular: objectMetadataItem.nameSingular,
          objectRecordId: recordId,
        });
      }

      return createdRecord;
    },
    [
      buildRecordInputFromRLSPredicates,
      buildRecordInput,
      createAndStoreRecord,
      store,
      navigate,
      objectMetadataItem,
      openRecordInSidePanel,
      openRecordIn,
      closeSidePanelMenu,
      workspaceSurface.type,
      requestRecordCreation,
      // OMNIA-CUSTOM: reconciliation intercept dependencies
      location.pathname,
      openReconciliationWizard,
    ],
  );

  return {
    createNewRecord,
  };
};
