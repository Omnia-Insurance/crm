import { type FieldViolation } from '@/object-record/record-field/ui/hooks/useRecordRequiredFieldViolations';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

type RequiredFieldsValidationData = {
  pendingAction: 'close' | 'back';
  violations: FieldViolation[];
  recordId: string;
  objectNameSingular: string;
};

export const requiredFieldsValidationState =
  createAtomState<RequiredFieldsValidationData | null>({
    key: 'requiredFieldsValidationState',
    defaultValue: null,
  });
