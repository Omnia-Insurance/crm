import { EngineComponentKey } from '~/generated-metadata/graphql';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type Nullable } from 'twenty-shared/types';

// OMNIA-CUSTOM: resolves "Create Record" labels to object-aware variants
// (e.g. "Create Policy") and applies blue accent CTA styling.
export const resolveCreateRecordActionLabels = <
  TAction extends {
    engineComponentKey: string;
    label: Nullable<string>;
    shortLabel?: Nullable<string>;
  },
>(
  actions: TAction[],
  objectMetadataItem?: Pick<EnrichedObjectMetadataItem, 'labelSingular'>,
): TAction[] => {
  if (!objectMetadataItem) {
    return actions;
  }

  const createRecordLabel = `Create ${objectMetadataItem.labelSingular}`;

  return actions.map((action) => {
    if (action.engineComponentKey !== EngineComponentKey.CREATE_NEW_RECORD) {
      return action;
    }

    return {
      ...action,
      label: createRecordLabel,
      shortLabel: createRecordLabel,
    };
  });
};
