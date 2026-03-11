import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

const STORAGE_KEY = 'newlyCreatedRecordIds';

// Map of recordId → objectNameSingular
type NewlyCreatedRecordMap = Map<string, string>;

const loadFromSession = (): NewlyCreatedRecordMap => {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      return new Map(JSON.parse(stored) as [string, string][]);
    }
  } catch {
    // ignore
  }
  return new Map();
};

export const persistNewlyCreatedRecordIds = (map: NewlyCreatedRecordMap) => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...map.entries()]));
  } catch {
    // ignore
  }
};

export const newlyCreatedRecordIdsState =
  createAtomState<NewlyCreatedRecordMap>({
    key: 'newlyCreatedRecordIdsState',
    defaultValue: loadFromSession(),
  });
