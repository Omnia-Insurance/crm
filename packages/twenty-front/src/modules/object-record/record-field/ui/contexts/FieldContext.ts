import { createContext, type MouseEvent } from 'react';

import { type TriggerEventType } from 'twenty-ui/utilities';
import { type FieldDefinition } from '@/object-record/record-field/ui/types/FieldDefinition';
import { type FieldMetadata } from '@/object-record/record-field/ui/types/FieldMetadata';

export type RecordUpdateHookParams = {
  variables: {
    where: Record<string, unknown>;
    updateOneRecordInput: Record<string, unknown>;
  };
};

export type RecordUpdateHookReturn = {
  loading?: boolean;
};

export type RecordUpdateHook = () => [
  (params: RecordUpdateHookParams) => void,
  RecordUpdateHookReturn,
];

// OMNIA-CUSTOM: Reconciliation diff overlay data
export type FieldDiffOverlay = {
  oldValue: string | null;
  newValue: string | null;
  label: string;
  /** Full CRM field path, e.g. "emails.primaryEmail" for composite sub-fields */
  crmFieldPath?: string;
  /** Tooltip body shown on the inline diff (e.g. status change reason) */
  note?: string | null;
};

export type GenericFieldContextType = {
  fieldMetadataItemId?: string;
  recordId: string;
  fieldDefinition: FieldDefinition<FieldMetadata>;
  useUpdateRecord?: RecordUpdateHook;
  isLabelIdentifier: boolean;
  isLabelIdentifierCompact?: boolean;
  clearable?: boolean;
  maxWidth?: number;
  isCentered?: boolean;
  overridenIsFieldEmpty?: boolean;
  displayedMaxRows?: number;
  isDisplayModeFixHeight?: boolean;
  isRecordFieldReadOnly: boolean;
  disableChipClick?: boolean;
  onRecordChipClick?: (event: MouseEvent) => void;
  onOpenEditMode?: () => void;
  onCloseEditMode?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  triggerEvent?: TriggerEventType;
  isForbidden?: boolean;
  anchorId?: string;
  // OMNIA-CUSTOM: reconciliation diff overlay
  fieldDiff?: FieldDiffOverlay;
};

export const FieldContext = createContext<GenericFieldContextType>(
  {} as GenericFieldContextType,
);
