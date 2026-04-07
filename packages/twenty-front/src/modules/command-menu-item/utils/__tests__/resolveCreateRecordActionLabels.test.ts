import { EngineComponentKey } from '~/generated-metadata/graphql';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { resolveCreateRecordActionLabels } from '@/command-menu-item/utils/resolveCreateRecordActionLabels';

describe('resolveCreateRecordActionLabels', () => {
  it('rewrites the create record action label and marks it as the primary CTA', () => {
    const actions = [
      {
        key: EngineComponentKey.CREATE_NEW_RECORD,
        label: 'Create new record',
        shortLabel: 'New record',
        isPrimaryCTA: false,
      },
      {
        key: 'other-action',
        label: 'Other action',
      },
    ];

    const objectMetadataItem = {
      labelSingular: 'Policy',
    } as Pick<EnrichedObjectMetadataItem, 'labelSingular'>;

    expect(
      resolveCreateRecordActionLabels(actions, objectMetadataItem),
    ).toEqual([
      {
        key: EngineComponentKey.CREATE_NEW_RECORD,
        label: 'Create Policy',
        shortLabel: 'Create Policy',
        accent: 'blue',
        buttonVariant: 'primary',
        isPrimaryCTA: true,
      },
      {
        key: 'other-action',
        label: 'Other action',
      },
    ]);
  });

  it('leaves actions unchanged when no object metadata is available', () => {
    const actions = [
      {
        key: EngineComponentKey.CREATE_NEW_RECORD,
        label: 'Create new record',
        shortLabel: 'New record',
      },
    ];

    expect(resolveCreateRecordActionLabels(actions)).toEqual(actions);
  });
});
