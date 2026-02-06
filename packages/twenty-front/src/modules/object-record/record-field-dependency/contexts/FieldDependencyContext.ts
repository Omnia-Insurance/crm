import { createContext } from 'react';

import { type ObjectRecordFilterInput } from '~/generated/graphql';

export type FieldDependencyContextValue = {
  getFilterForField: (
    fieldName: string,
  ) => ObjectRecordFilterInput | undefined;
  clearDependentFields: (parentFieldName: string) => void;
};

export const FieldDependencyContext =
  createContext<FieldDependencyContextValue | null>(null);
