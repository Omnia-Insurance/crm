import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type ObjectRecord } from '@/object-record/types/ObjectRecord';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export type DraftRecordMeta = {
  objectNameSingular: string;
  objectMetadataItem: EnrichedObjectMetadataItem;
  hiddenFieldNames: Set<string>;
  extraRecordInput: Partial<ObjectRecord>;
  onRecordCreated?: (record: ObjectRecord) => void | Promise<void>;
  // Saves unsaved records this draft points at (e.g. a new Policy's draft
  // Lead) so the draft's foreign keys resolve when it is inserted.
  persistDependencies?: () => Promise<void>;
};

export const draftRecordIdsState = createAtomState<
  Map<string, DraftRecordMeta>
>({
  key: 'draftRecordIdsState',
  defaultValue: new Map(),
});
