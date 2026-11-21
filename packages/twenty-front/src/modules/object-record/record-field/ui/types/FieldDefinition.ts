import { type FieldMetadataType } from '~/generated-metadata/graphql';

// OMNIA-CUSTOM: soft required-field rule (contract C5)
import { type RequiredCondition } from 'twenty-shared/types';
import { type IconComponent } from 'twenty-ui/icon';
import { type FieldMetadata } from './FieldMetadata';

export type FieldDefinition<T extends FieldMetadata> = {
  fieldMetadataId: string;
  label: string;
  showLabel?: boolean;
  labelWidth?: number;
  iconName: string;
  type: FieldMetadataType;
  metadata: T;
  defaultValue?: any;
  editButtonIcon?: IconComponent;
  isUIEditable?: boolean;
  // OMNIA-CUSTOM: soft required-field rule (contract C5)
  requiredCondition?: RequiredCondition | null;
};
