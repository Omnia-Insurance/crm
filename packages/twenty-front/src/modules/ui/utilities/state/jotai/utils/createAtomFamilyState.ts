import { atom } from 'jotai';
import { atomWithStorage, createJSONStorage } from 'jotai/utils';
import { type SyncStringStorage } from 'jotai/vanilla/utils/atomWithStorage';
import { isDefined } from 'twenty-shared/utils';

import { type FamilyState } from '@/ui/utilities/state/jotai/types/FamilyState';
import { type JotaiSyncStorage } from '@/ui/utilities/state/jotai/types/JotaiSyncStorage';

export const createAtomFamilyState = <ValueType, FamilyKey>({
  key,
  defaultValue,
  useLocalStorage = false,
  localStorageOptions,
  storage,
  customStringStorage,
}: {
  key: string;
  defaultValue: ValueType;
  useLocalStorage?: boolean;
  localStorageOptions?: { getOnInit?: boolean };
  storage?: JotaiSyncStorage<ValueType>;
  // OMNIA-CUSTOM: string-based storage wrapped via createJSONStorage
  customStringStorage?: SyncStringStorage;
}): FamilyState<ValueType, FamilyKey> => {
  const atomCache = new Map<
    string,
    ReturnType<FamilyState<ValueType, FamilyKey>['atomFamily']>
  >();

  const familyFunction = (
    familyKey: FamilyKey,
  ): ReturnType<FamilyState<ValueType, FamilyKey>['atomFamily']> => {
    const cacheKey =
      typeof familyKey === 'string' ? familyKey : JSON.stringify(familyKey);

    const existing = atomCache.get(cacheKey);

    if (existing !== undefined) {
      return existing;
    }

    const atomKey = `${key}__${cacheKey}`;

    // OMNIA-CUSTOM: customStringStorage wraps a SyncStringStorage via
    // createJSONStorage; otherwise fall back to upstream's typed storage param.
    const effectiveStorage = isDefined(customStringStorage)
      ? createJSONStorage<ValueType>(() => customStringStorage)
      : storage;

    const buildBaseAtom = () => {
      if (isDefined(effectiveStorage)) {
        return atomWithStorage<ValueType>(
          atomKey,
          defaultValue,
          effectiveStorage,
          localStorageOptions ?? { getOnInit: true },
        );
      }

      if (useLocalStorage) {
        return atomWithStorage<ValueType>(
          atomKey,
          defaultValue,
          storage,
          localStorageOptions ?? undefined,
        );
      }

      return atom(defaultValue);
    };

    const baseAtom = buildBaseAtom();
    baseAtom.debugLabel = atomKey;
    atomCache.set(cacheKey, baseAtom);

    return baseAtom;
  };

  return Object.assign(familyFunction, {
    type: 'FamilyState' as const,
    key,
    atomFamily: familyFunction,
  });
};
