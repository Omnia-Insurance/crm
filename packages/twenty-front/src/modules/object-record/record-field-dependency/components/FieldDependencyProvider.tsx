import { type ReactNode, useCallback, useMemo } from 'react';
import { useRecoilValue } from 'recoil';

import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useObjectMetadataItems } from '@/object-metadata/hooks/useObjectMetadataItems';
import { FieldDependencyContext } from '@/object-record/record-field-dependency/contexts/FieldDependencyContext';
import { useCascadeClearDependentFields } from '@/object-record/record-field-dependency/hooks/useCascadeClearDependentFields';
import { computeFieldDependencyGraph } from '@/object-record/record-field-dependency/utils/computeFieldDependencyGraph';
import { recordStoreFamilyState } from '@/object-record/record-store/states/recordStoreFamilyState';
import { type ObjectRecordFilterInput } from '~/generated/graphql';

type FieldDependencyProviderProps = {
  objectNameSingular: string;
  recordId: string;
  children: ReactNode;
};

export const FieldDependencyProvider = ({
  objectNameSingular,
  recordId,
  children,
}: FieldDependencyProviderProps) => {
  const { objectMetadataItem } = useObjectMetadataItem({
    objectNameSingular,
  });
  const { objectMetadataItems } = useObjectMetadataItems();

  const dependencyGraph = useMemo(
    () => computeFieldDependencyGraph(objectMetadataItem, objectMetadataItems),
    [objectMetadataItem, objectMetadataItems],
  );

  const recordData = useRecoilValue(recordStoreFamilyState(recordId));

  const { clearDependentFields } = useCascadeClearDependentFields({
    objectNameSingular,
    recordId,
    dependencyGraph,
  });

  const getFilterForField = useCallback(
    (fieldName: string): ObjectRecordFilterInput | undefined => {
      const dependencies = dependencyGraph.dependenciesByField[fieldName];

      if (!dependencies || dependencies.length === 0) {
        return undefined;
      }

      const filters: (ObjectRecordFilterInput | undefined)[] =
        dependencies.map((dep) => {
          const parentValue = recordData?.[dep.parentFieldName] as
            | { id: string }
            | null
            | undefined;

          if (!parentValue?.id) {
            return undefined;
          }

          return {
            [dep.bridgeFieldForeignKeyName]: { eq: parentValue.id },
          } as ObjectRecordFilterInput;
        });

      const definedFilters = filters.filter(
        (f): f is ObjectRecordFilterInput => f !== undefined,
      );

      if (definedFilters.length === 0) {
        return undefined;
      }

      if (definedFilters.length === 1) {
        return definedFilters[0];
      }

      return { and: definedFilters };
    },
    [dependencyGraph.dependenciesByField, recordData],
  );

  const contextValue = useMemo(
    () => ({
      getFilterForField,
      clearDependentFields,
    }),
    [getFilterForField, clearDependentFields],
  );

  return (
    <FieldDependencyContext.Provider value={contextValue}>
      {children}
    </FieldDependencyContext.Provider>
  );
};
