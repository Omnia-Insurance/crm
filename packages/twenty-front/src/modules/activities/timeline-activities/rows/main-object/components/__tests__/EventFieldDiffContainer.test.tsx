import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import { FieldMetadataType, RelationType } from 'twenty-shared/types';

import { EventFieldDiffContainer } from '@/activities/timeline-activities/rows/main-object/components/EventFieldDiffContainer';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';

jest.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: jest.fn(),
}));

jest.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: jest.fn(),
}));

jest.mock('@/object-metadata/utils/getObjectRecordIdentifier', () => ({
  getObjectRecordIdentifier: ({ record }: { record: { name: string } }) => ({
    name: record.name,
  }),
}));

jest.mock(
  '@/activities/timeline-activities/rows/main-object/components/EventFieldDiffLabel',
  () => ({
    EventFieldDiffLabel: ({
      fieldMetadataItem,
    }: {
      fieldMetadataItem: { label: string };
    }) => <span>{fieldMetadataItem.label}</span>,
  }),
);

// The value components render through the record store; echoing the store id
// shows which side of the diff each one renders
jest.mock(
  '@/activities/timeline-activities/rows/main-object/components/EventFieldDiffValue',
  () => ({
    EventFieldDiffValue: ({
      diffArtificialRecordStoreId,
    }: {
      diffArtificialRecordStoreId: string;
    }) => <div>{`value of ${diffArtificialRecordStoreId}`}</div>,
  }),
);

jest.mock(
  '@/activities/timeline-activities/rows/main-object/components/EventFieldDiffValueEffect',
  () => ({ EventFieldDiffValueEffect: () => null }),
);

const { useFindManyRecords } = jest.requireMock(
  '@/object-record/hooks/useFindManyRecords',
);
const { useObjectMetadataItem } = jest.requireMock(
  '@/object-metadata/hooks/useObjectMetadataItem',
);

const AGENT_FIELD_METADATA_ITEM: FieldMetadataItem = {
  id: 'agent-field-id',
  universalIdentifier: 'agent-field-id',
  name: 'agent',
  label: 'Agent',
  type: FieldMetadataType.RELATION,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  relation: {
    type: RelationType.MANY_TO_ONE,
    sourceFieldMetadata: { id: 'agent-field-id', name: 'agent' },
    targetFieldMetadata: { id: 'policies-field-id', name: 'policies' },
    sourceObjectMetadata: {
      id: 'policy-object-id',
      nameSingular: 'policy',
      namePlural: 'policies',
    },
    targetObjectMetadata: {
      id: 'agent-profile-object-id',
      nameSingular: 'agentProfile',
      namePlural: 'agentProfiles',
    },
  },
};

const CARRIER_NAME_FIELD_METADATA_ITEM: FieldMetadataItem = {
  id: 'carrier-name-field-id',
  universalIdentifier: 'carrier-name-field-id',
  name: 'carrierName',
  label: 'Carrier name',
  type: FieldMetadataType.TEXT,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

const AGENT_EMAILS_FIELD_METADATA_ITEM: FieldMetadataItem = {
  ...CARRIER_NAME_FIELD_METADATA_ITEM,
  id: 'agent-emails-field-id',
  universalIdentifier: 'agent-emails-field-id',
  name: 'agentEmails',
  label: 'Agent emails',
  type: FieldMetadataType.EMAILS,
};

const POLICY_OBJECT_METADATA_ITEM = {
  nameSingular: 'policy',
  fields: [
    AGENT_FIELD_METADATA_ITEM,
    CARRIER_NAME_FIELD_METADATA_ITEM,
    AGENT_EMAILS_FIELD_METADATA_ITEM,
  ],
} as EnrichedObjectMetadataItem;

const renderFieldDiff = ({
  diffKey,
  fieldDiff,
}: {
  diffKey: string;
  fieldDiff: { before: unknown; after: unknown };
}) =>
  render(
    <I18nProvider i18n={i18n}>
      <EventFieldDiffContainer
        mainObjectMetadataItem={POLICY_OBJECT_METADATA_ITEM}
        diffKey={diffKey}
        fieldDiff={fieldDiff}
        eventId="event-id"
      />
    </I18nProvider>,
  );

describe('EventFieldDiffContainer', () => {
  beforeEach(() => {
    useObjectMetadataItem.mockReturnValue({
      objectMetadataItem: { nameSingular: 'agentProfile' },
    });
    useFindManyRecords.mockReturnValue({
      records: [
        { id: 'agent-before-id', name: 'Dana Reyes' },
        { id: 'agent-after-id', name: 'Sam Ortiz' },
      ],
      loading: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('resolves a legacy bare-uuid relation diff keyed by the relation name', () => {
    renderFieldDiff({
      diffKey: 'agent',
      fieldDiff: { before: 'agent-before-id', after: 'agent-after-id' },
    });

    expect(screen.getByRole('deletion')).toHaveTextContent('Dana Reyes');
    expect(screen.getByText('Sam Ortiz')).toBeInTheDocument();
    expect(useFindManyRecords).toHaveBeenCalledWith(
      expect.objectContaining({
        objectNameSingular: 'agentProfile',
        filter: { id: { in: ['agent-before-id', 'agent-after-id'] } },
      }),
    );
  });

  it('resolves a legacy bare-uuid relation diff keyed by the join column', () => {
    renderFieldDiff({
      diffKey: 'agentId',
      fieldDiff: { before: 'agent-before-id', after: null },
    });

    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByRole('deletion')).toHaveTextContent('Dana Reyes');
    expect(screen.getByText('Empty')).toBeInTheDocument();
  });

  it('renders "Empty" and no previous value for an empty relation diff', () => {
    renderFieldDiff({
      diffKey: 'agent',
      fieldDiff: { before: undefined, after: undefined },
    });

    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByText('Empty')).toBeInTheDocument();
    expect(screen.queryByRole('deletion')).not.toBeInTheDocument();
  });

  it('renders the previous value of a non-relation field struck through', () => {
    renderFieldDiff({
      diffKey: 'carrierName',
      fieldDiff: { before: 'Ambetter', after: 'Oscar' },
    });

    expect(screen.getByRole('deletion')).toHaveTextContent(
      'value of event-id--before--carrier-name-field-id',
    );
    expect(
      screen.getByText('value of event-id--carrier-name-field-id'),
    ).toBeInTheDocument();
    expect(screen.getByText('→')).toBeInTheDocument();
  });

  it('hides the previous value of a non-relation field that was empty', () => {
    renderFieldDiff({
      diffKey: 'carrierName',
      fieldDiff: { before: '', after: 'Oscar' },
    });

    expect(screen.queryByRole('deletion')).not.toBeInTheDocument();
    expect(
      screen.getByText('value of event-id--carrier-name-field-id'),
    ).toBeInTheDocument();
  });

  it('hides the previous value when every sub-field of a composite was empty', () => {
    renderFieldDiff({
      diffKey: 'agentEmails',
      fieldDiff: {
        before: { primaryEmail: '', additionalEmails: null },
        after: { primaryEmail: 'agent@example.com', additionalEmails: null },
      },
    });

    expect(screen.queryByRole('deletion')).not.toBeInTheDocument();
    expect(
      screen.getByText('value of event-id--agent-emails-field-id'),
    ).toBeInTheDocument();
  });
});
