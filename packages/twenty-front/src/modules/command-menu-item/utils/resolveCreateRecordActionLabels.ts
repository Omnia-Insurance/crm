import { NoSelectionRecordCommandKeys } from '@/command-menu-item/record/no-selection/types/NoSelectionRecordCommandKeys';
import { type ObjectMetadataItem } from '@/object-metadata/types/ObjectMetadataItem';
import { type MessageDescriptor } from '@lingui/core';
import { type ButtonAccent, type ButtonVariant } from 'twenty-ui/input';

export const resolveCreateRecordActionLabels = <
  TAction extends {
    key: string;
    label: string | MessageDescriptor;
    shortLabel?: string | MessageDescriptor;
    accent?: ButtonAccent;
    buttonVariant?: ButtonVariant;
    isPrimaryCTA?: boolean;
  },
>(
  actions: TAction[],
  objectMetadataItem?: Pick<ObjectMetadataItem, 'labelSingular'>,
): TAction[] => {
  if (!objectMetadataItem) {
    return actions;
  }

  const createRecordLabel = `Create ${objectMetadataItem.labelSingular}`;

  return actions.map((action) => {
    if (action.key !== NoSelectionRecordCommandKeys.CREATE_NEW_RECORD) {
      return action;
    }

    return {
      ...action,
      label: createRecordLabel,
      shortLabel: createRecordLabel,
      accent: 'blue',
      buttonVariant: 'primary',
      isPrimaryCTA: true,
    };
  });
};
