import { atom, type Atom } from 'jotai';
import { useAtomValue } from 'jotai/react';
import { useMemo } from 'react';

import { objectMetadataItemFamilySelector } from '@/object-metadata/states/objectMetadataItemFamilySelector';
import { type DraftRecordMeta } from '@/object-record/record-side-panel/states/draftRecordIdsState';
import { type FieldViolation } from '@/object-record/record-field/ui/utils/getRecordRequiredFieldViolations';
import { getRecordRequiredFieldViolations } from '@/object-record/record-field/ui/utils/getRecordRequiredFieldViolations';
import {
  type RelatedRecordViolation,
  getRelatedRecordViolations,
} from '@/object-record/record-field/ui/utils/getRelatedRecordViolations';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { FieldMetadataType } from 'twenty-shared/types';
import { RelationType } from '~/generated-metadata/graphql';

export type DraftCombinedViolations = {
  draftViolations: FieldViolation[];
  relatedViolations: RelatedRecordViolation[];
  allViolationsCount: number;
};

const EMPTY: DraftCombinedViolations = {
  draftViolations: [],
  relatedViolations: [],
  allViolationsCount: 0,
};

// Cache of derived atoms per draft record ID — avoids recreating on every render
const atomCache = new Map<string, Atom<DraftCombinedViolations>>();

export const clearDraftViolationsAtom = (draftRecordId: string) => {
  atomCache.delete(draftRecordId);
};

const buildDraftWithRelatedViolationsAtom = (
  draftRecordId: string,
  draftMeta: DraftRecordMeta,
): Atom<DraftCombinedViolations> => {
  const existing = atomCache.get(draftRecordId);
  if (existing) return existing;

  // Pre-compute MANY_TO_ONE relation fields from metadata (stable)
  const manyToOneFields = draftMeta.objectMetadataItem.fields.filter(
    (f) =>
      f.type === FieldMetadataType.RELATION &&
      f.relation?.type === RelationType.MANY_TO_ONE &&
      f.relation?.targetObjectMetadata?.nameSingular,
  );

  const derivedAtom = atom((jotaiGet) => {
    // Read draft record — registers reactive dependency
    const draftRecord = jotaiGet(
      recordStoreFamilyState.atomFamily(draftRecordId),
    ) as ObjectRecord | null | undefined;

    if (!draftRecord) return EMPTY;

    // Compute own violations
    const draftViolations = getRecordRequiredFieldViolations(
      draftRecord,
      draftMeta.objectMetadataItem,
    );

    // Compute related record violations using accessor functions that
    // register Jotai reactive dependencies via jotaiGet
    const relatedViolations = getRelatedRecordViolations(
      draftRecord,
      draftMeta.objectMetadataItem,
      (nameSingular: string) =>
        jotaiGet(
          objectMetadataItemFamilySelector.selectorFamily({
            objectName: nameSingular,
            objectNameType: 'singular',
          }),
        ),
      (id: string) =>
        jotaiGet(recordStoreFamilyState.atomFamily(id)) as
          | ObjectRecord
          | null
          | undefined,
    );

    const relatedCount = relatedViolations.reduce(
      (sum, rv) => sum + rv.violations.length,
      0,
    );

    return {
      draftViolations,
      relatedViolations,
      allViolationsCount: draftViolations.length + relatedCount,
    };
  });

  derivedAtom.debugLabel = `draftCombinedViolations__${draftRecordId}`;
  atomCache.set(draftRecordId, derivedAtom);

  return derivedAtom;
};

export const useDraftCombinedViolations = (
  draftRecordId: string,
  draftMeta: DraftRecordMeta | undefined,
): DraftCombinedViolations | null => {
  const violationsAtom = useMemo(() => {
    if (!draftMeta) return null;
    return buildDraftWithRelatedViolationsAtom(draftRecordId, draftMeta);
  }, [draftRecordId, draftMeta]);

  // useAtomValue requires a stable atom — we conditionally call it only when
  // violationsAtom exists. When null (not a draft), we return null.
  // We use a stable fallback atom to avoid conditional hook calls.
  const fallbackAtom = useMemo(() => atom(() => EMPTY), []);
  const value = useAtomValue(violationsAtom ?? fallbackAtom);

  return violationsAtom ? value : null;
};
