import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export type ActiveImportJob = {
  importJobId: string;
  objectNameSingular: string;
  totalRecords: number;
};

export const activeImportJobState = createAtomState<ActiveImportJob | null>({
  key: 'activeImportJobState',
  defaultValue: null,
});
