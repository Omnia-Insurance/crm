import { CoreObjectNameSingular } from 'twenty-shared/types';
import { EngineComponentKey } from '~/generated-metadata/graphql';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type Nullable } from 'twenty-shared/types';

// Maps "Go to" action engine keys to the object they navigate to
const GO_TO_ACTION_OBJECT_MAP: Record<string, CoreObjectNameSingular> = {
  [EngineComponentKey.GO_TO_PEOPLE]: CoreObjectNameSingular.Person,
  [EngineComponentKey.GO_TO_COMPANIES]: CoreObjectNameSingular.Company,
  [EngineComponentKey.GO_TO_OPPORTUNITIES]: CoreObjectNameSingular.Opportunity,
  [EngineComponentKey.GO_TO_TASKS]: CoreObjectNameSingular.Task,
  [EngineComponentKey.GO_TO_NOTES]: CoreObjectNameSingular.Note,
  [EngineComponentKey.GO_TO_WORKFLOWS]: CoreObjectNameSingular.Workflow,
  [EngineComponentKey.GO_TO_DASHBOARDS]: CoreObjectNameSingular.Dashboard,
};

// OMNIA-CUSTOM: resolves "Go to" labels from object metadata and filters deactivated objects
export const resolveGoToActionLabels = <
  TAction extends {
    engineComponentKey: string;
    label: Nullable<string>;
    shortLabel?: Nullable<string>;
  },
>(
  actions: TAction[],
  objectMetadataItems: Pick<
    EnrichedObjectMetadataItem,
    'nameSingular' | 'labelPlural' | 'isActive'
  >[],
): TAction[] => {
  return actions
    .filter((action) => {
      const targetObjectNameSingular =
        GO_TO_ACTION_OBJECT_MAP[action.engineComponentKey];

      if (!targetObjectNameSingular) {
        return true;
      }

      const targetObjectMetadata = objectMetadataItems.find(
        (item) => item.nameSingular === targetObjectNameSingular,
      );

      // Keep the item if we can't find the target (shouldn't happen), filter if deactivated
      return !targetObjectMetadata || targetObjectMetadata.isActive;
    })
    .map((action) => {
      const targetObjectNameSingular =
        GO_TO_ACTION_OBJECT_MAP[action.engineComponentKey];

      if (!targetObjectNameSingular) {
        return action;
      }

      const targetObjectMetadata = objectMetadataItems.find(
        (item) => item.nameSingular === targetObjectNameSingular,
      );

      if (!targetObjectMetadata) {
        return action;
      }

      return {
        ...action,
        label: `Go to ${targetObjectMetadata.labelPlural}`,
        shortLabel: targetObjectMetadata.labelPlural,
      };
    });
};
