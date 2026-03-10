import { NoSelectionRecordCommandKeys } from '@/command-menu-item/record/no-selection/types/NoSelectionRecordCommandKeys';
import { CoreObjectNameSingular } from 'twenty-shared/types';
import { type ObjectMetadataItem } from '@/object-metadata/types/ObjectMetadataItem';

// Maps "Go to" action keys to the object they navigate to
const GO_TO_ACTION_OBJECT_MAP: Record<string, CoreObjectNameSingular> = {
  [NoSelectionRecordCommandKeys.GO_TO_PEOPLE]: CoreObjectNameSingular.Person,
  [NoSelectionRecordCommandKeys.GO_TO_COMPANIES]: CoreObjectNameSingular.Company,
  [NoSelectionRecordCommandKeys.GO_TO_OPPORTUNITIES]:
    CoreObjectNameSingular.Opportunity,
  [NoSelectionRecordCommandKeys.GO_TO_TASKS]: CoreObjectNameSingular.Task,
  [NoSelectionRecordCommandKeys.GO_TO_NOTES]: CoreObjectNameSingular.Note,
  [NoSelectionRecordCommandKeys.GO_TO_WORKFLOWS]:
    CoreObjectNameSingular.Workflow,
  [NoSelectionRecordCommandKeys.GO_TO_DASHBOARDS]:
    CoreObjectNameSingular.Dashboard,
};

export const resolveGoToActionLabels = <
  TAction extends { key: string; label: string; shortLabel?: string },
>(
  actions: TAction[],
  objectMetadataItems: ObjectMetadataItem[],
): TAction[] => {
  return actions.map((action) => {
    const targetObjectNameSingular = GO_TO_ACTION_OBJECT_MAP[action.key];

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
