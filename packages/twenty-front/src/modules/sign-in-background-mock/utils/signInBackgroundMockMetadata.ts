import { type FlatFieldMetadataItem } from '@/metadata-store/types/FlatFieldMetadataItem';
import { type FlatObjectMetadataItem } from '@/metadata-store/types/FlatObjectMetadataItem';
import { type FlatView } from '@/metadata-store/types/FlatView';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { RelationType } from 'twenty-shared/types';
import { isDefined } from 'twenty-shared/utils';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

function getBasePersonObjectMetadataItem() {
  return getMockObjectMetadataItemOrThrow('person');
}

function getBaseCompanyObjectMetadataItem() {
  return getMockObjectMetadataItemOrThrow('company');
}

function getBaseWorkspaceMemberObjectMetadataItem() {
  return getMockObjectMetadataItemOrThrow('workspaceMember');
}

function getFieldMetadataItemOrThrow(
  objectMetadataItem: EnrichedObjectMetadataItem,
  fieldName: string,
) {
  const fieldMetadataItem = objectMetadataItem.fields.find(
    (field) => field.name === fieldName,
  );

  if (!isDefined(fieldMetadataItem)) {
    throw new Error(
      `Missing sign-in background mock field metadata for "${fieldName}"`,
    );
  }

  return fieldMetadataItem;
}

export function getSignInBackgroundMockMetadataIds() {
  return {
    objects: {
      leadSource: 'd6bd22f4-3c73-422f-bbd4-b1b2f45ab221',
      policy: 'f8d4682f-877f-47cc-a360-2b36c5db21d7',
    },
    fields: {
      person: {
        status: '7bfb48b7-5c1e-4249-b9cb-a16ac6c3222f',
        leadSource: '932c0fea-2143-4970-b7e0-44d77427f280',
        assignedAgent: '46a0e615-c2a8-4548-a8ab-3ac425af9448',
        policies: '88e1ab97-1205-48c8-a0f7-573824de20e7',
        address: '5d86c096-a4ba-4b59-a3c7-f2ea8e9e2d9f',
      },
      leadSource: {
        id: '883f6e5e-6cdf-499d-9a90-74bbaea8c8d3',
        name: 'c193c7aa-4e99-45c6-b398-4fa4ff2a2c57',
      },
      policy: {
        id: '2a1254c8-a9ea-4454-b5df-1b9688eae4bf',
        name: '9b8db3c3-4bc7-4b35-a0be-cf618c85fa30',
      },
      backlinks: {
        workspaceMemberAssignedLeads: 'ece07b1e-2fd1-48ff-a85b-2fa79bdf35d1',
        leadSourceLeads: 'c1909a94-b954-4773-bb64-8e9936f56e74',
        policyLead: 'c14f0448-85b2-42b8-8814-9813e01d89f1',
      },
    },
    universalIdentifiers: {
      person: {
        status: '1b930ad4-b7bc-4cff-bf66-f4dbb7115535',
        leadSource: '3f6f7fb1-1b0e-4d3e-a8ba-c874f57f34a5',
        assignedAgent: '84cb0c33-c37d-4f3b-8d2e-d28e0d2df77b',
        policies: 'a3cf9cc4-bb86-46a8-a2ed-4abf9b266d88',
        address: 'd9795b17-2684-4d52-83f9-c0f9aeb5e39b',
      },
      objects: {
        leadSource: 'cfeb6642-5026-44a5-84c1-37236dc5d284',
        policy: '2d6f0ac5-5c74-4858-9bf9-bfd173264664',
      },
      leadSource: {
        id: '8bfd91ea-e696-452b-921a-112f8e765417',
        name: '2d5eb246-c2cc-44ff-a355-f72c3bf7bcbb',
      },
      policy: {
        id: '90253cb4-64a0-46d6-93e0-a92fe2cd15ef',
        name: 'cfef4f9a-3f7f-4365-b3a1-c495a645d44a',
      },
    },
  };
}

function createSelectFieldMetadataItem(): FieldMetadataItem {
  const baseSelectFieldMetadataItem = getFieldMetadataItemOrThrow(
    getBaseWorkspaceMemberObjectMetadataItem(),
    'dateFormat',
  );
  const metadataIds = getSignInBackgroundMockMetadataIds();

  return {
    ...baseSelectFieldMetadataItem,
    id: metadataIds.fields.person.status,
    universalIdentifier: metadataIds.universalIdentifiers.person.status,
    name: 'status',
    label: 'Status',
    description: 'Lead status',
    icon: 'IconTag',
    isCustom: true,
    isSystem: false,
    isUIReadOnly: false,
    isNullable: true,
    defaultValue: null,
    options: [
      {
        id: '18a9824a-7627-43a1-a966-d9ecff3e3312',
        color: 'green',
        label: 'Sold',
        value: 'SOLD',
        position: 0,
      },
      {
        id: 'b9834ec7-6bc8-4b6f-a1f9-f793cf3dfcbe',
        color: 'yellow',
        label: 'Assigned',
        value: 'ASSIGNED',
        position: 1,
      },
      {
        id: 'f0e2a33c-b166-4bc7-9778-f462ecb6dc7b',
        color: 'orange',
        label: 'Contacted',
        value: 'CONTACTED',
        position: 2,
      },
    ],
    relation: null,
    morphRelations: null,
  };
}

function createAddressFieldMetadataItem(): FieldMetadataItem {
  const baseAddressFieldMetadataItem = getFieldMetadataItemOrThrow(
    getBaseCompanyObjectMetadataItem(),
    'address',
  );
  const metadataIds = getSignInBackgroundMockMetadataIds();

  return {
    ...baseAddressFieldMetadataItem,
    id: metadataIds.fields.person.address,
    universalIdentifier: metadataIds.universalIdentifiers.person.address,
    name: 'address',
    label: 'Address',
    description: 'Lead address',
    icon: 'IconMap',
    isCustom: true,
    relation: null,
    morphRelations: null,
  };
}

function createManyToOneRelationFieldMetadataItem({
  id,
  universalIdentifier,
  fieldName,
  fieldLabel,
  description,
  icon,
  joinColumnName,
  targetObjectId,
  targetObjectNameSingular,
  targetObjectNamePlural,
  targetFieldId,
  targetFieldName,
  targetFieldIsCustom = true,
}: {
  id: string;
  universalIdentifier: string;
  fieldName: string;
  fieldLabel: string;
  description: string;
  icon: string;
  joinColumnName: string;
  targetObjectId: string;
  targetObjectNameSingular: string;
  targetObjectNamePlural: string;
  targetFieldId: string;
  targetFieldName: string;
  targetFieldIsCustom?: boolean;
}): FieldMetadataItem {
  const basePersonObjectMetadataItem = getBasePersonObjectMetadataItem();
  const baseRelationFieldMetadataItem = getFieldMetadataItemOrThrow(
    basePersonObjectMetadataItem,
    'company',
  );

  return {
    ...baseRelationFieldMetadataItem,
    id,
    universalIdentifier,
    name: fieldName,
    label: fieldLabel,
    description,
    icon,
    isCustom: true,
    relation: {
      type: RelationType.MANY_TO_ONE,
      sourceFieldMetadata: {
        id,
        name: fieldName,
      },
      targetFieldMetadata: {
        id: targetFieldId,
        name: targetFieldName,
        isCustom: targetFieldIsCustom,
      },
      sourceObjectMetadata: {
        id: basePersonObjectMetadataItem.id,
        nameSingular: basePersonObjectMetadataItem.nameSingular,
        namePlural: basePersonObjectMetadataItem.namePlural,
      },
      targetObjectMetadata: {
        id: targetObjectId,
        nameSingular: targetObjectNameSingular,
        namePlural: targetObjectNamePlural,
      },
    },
    settings: {
      ...baseRelationFieldMetadataItem.settings,
      relationType: RelationType.MANY_TO_ONE,
      joinColumnName,
    },
  };
}

function createOneToManyRelationFieldMetadataItem(): FieldMetadataItem {
  const metadataIds = getSignInBackgroundMockMetadataIds();
  const basePersonObjectMetadataItem = getBasePersonObjectMetadataItem();
  const baseRelationFieldMetadataItem = getFieldMetadataItemOrThrow(
    basePersonObjectMetadataItem,
    'attachments',
  );

  return {
    ...baseRelationFieldMetadataItem,
    id: metadataIds.fields.person.policies,
    universalIdentifier: metadataIds.universalIdentifiers.person.policies,
    name: 'policies',
    label: 'Policies',
    description: 'Policies linked to the lead',
    icon: 'IconShield',
    isCustom: true,
    relation: {
      type: RelationType.ONE_TO_MANY,
      sourceFieldMetadata: {
        id: metadataIds.fields.person.policies,
        name: 'policies',
      },
      targetFieldMetadata: {
        id: metadataIds.fields.backlinks.policyLead,
        name: 'lead',
        isCustom: true,
      },
      sourceObjectMetadata: {
        id: basePersonObjectMetadataItem.id,
        nameSingular: basePersonObjectMetadataItem.nameSingular,
        namePlural: basePersonObjectMetadataItem.namePlural,
      },
      targetObjectMetadata: {
        id: metadataIds.objects.policy,
        nameSingular: 'policy',
        namePlural: 'policies',
      },
    },
    settings: {
      ...baseRelationFieldMetadataItem.settings,
      relationType: RelationType.ONE_TO_MANY,
    },
  };
}

export function getSignInBackgroundMockPersonCustomFieldMetadataItems() {
  const metadataIds = getSignInBackgroundMockMetadataIds();
  const workspaceMemberObjectMetadataItem =
    getBaseWorkspaceMemberObjectMetadataItem();

  return [
    createSelectFieldMetadataItem(),
    createManyToOneRelationFieldMetadataItem({
      id: metadataIds.fields.person.leadSource,
      universalIdentifier: metadataIds.universalIdentifiers.person.leadSource,
      fieldName: 'leadSource',
      fieldLabel: 'Lead Source',
      description: 'Source that originated the lead',
      icon: 'IconTargetArrow',
      joinColumnName: 'leadSourceId',
      targetObjectId: metadataIds.objects.leadSource,
      targetObjectNameSingular: 'leadSource',
      targetObjectNamePlural: 'leadSources',
      targetFieldId: metadataIds.fields.backlinks.leadSourceLeads,
      targetFieldName: 'leads',
    }),
    createManyToOneRelationFieldMetadataItem({
      id: metadataIds.fields.person.assignedAgent,
      universalIdentifier:
        metadataIds.universalIdentifiers.person.assignedAgent,
      fieldName: 'assignedAgent',
      fieldLabel: 'Assigned Agent',
      description: 'Agent assigned to the lead',
      icon: 'IconUserCircle',
      joinColumnName: 'assignedAgentId',
      targetObjectId: workspaceMemberObjectMetadataItem.id,
      targetObjectNameSingular: workspaceMemberObjectMetadataItem.nameSingular,
      targetObjectNamePlural: workspaceMemberObjectMetadataItem.namePlural,
      targetFieldId: metadataIds.fields.backlinks.workspaceMemberAssignedLeads,
      targetFieldName: 'assignedLeads',
    }),
    createOneToManyRelationFieldMetadataItem(),
    createAddressFieldMetadataItem(),
  ];
}

export function getSignInBackgroundMockObjectMetadataItem() {
  const basePersonObjectMetadataItem = getBasePersonObjectMetadataItem();

  return {
    ...basePersonObjectMetadataItem,
    labelSingular: 'Lead',
    labelPlural: 'Leads',
    description: 'A lead',
    fields: [
      ...basePersonObjectMetadataItem.fields,
      ...getSignInBackgroundMockPersonCustomFieldMetadataItems(),
    ],
  };
}

function createSimpleCustomObjectMetadataItem({
  objectId,
  universalIdentifier,
  nameSingular,
  namePlural,
  labelSingular,
  labelPlural,
  description,
  icon,
}: {
  objectId: string;
  universalIdentifier: string;
  nameSingular: string;
  namePlural: string;
  labelSingular: string;
  labelPlural: string;
  description: string;
  icon: string;
}): FlatObjectMetadataItem {
  const baseCompanyObjectMetadataItem = getBaseCompanyObjectMetadataItem();
  const fields = getSignInBackgroundMockMetadataIds().fields;

  const labelIdentifierFieldMetadataId =
    nameSingular === 'policy' ? fields.policy.name : fields.leadSource.name;

  return {
    ...baseCompanyObjectMetadataItem,
    id: objectId,
    universalIdentifier,
    nameSingular,
    namePlural,
    isCustom: true,
    isSystem: false,
    isUIReadOnly: false,
    labelIdentifierFieldMetadataId,
    imageIdentifierFieldMetadataId: null,
    shortcut: null,
    duplicateCriteria: null,
    labelSingular,
    labelPlural,
    description,
    icon,
  };
}

function createSimpleCustomObjectFieldMetadataItems({
  objectMetadataId,
  idFieldId,
  idFieldUniversalIdentifier,
  nameFieldId,
  nameFieldUniversalIdentifier,
  description,
  icon,
}: {
  objectMetadataId: string;
  idFieldId: string;
  idFieldUniversalIdentifier: string;
  nameFieldId: string;
  nameFieldUniversalIdentifier: string;
  description: string;
  icon: string;
}): FlatFieldMetadataItem[] {
  const baseCompanyObjectMetadataItem = getBaseCompanyObjectMetadataItem();
  const baseIdFieldMetadataItem = getFieldMetadataItemOrThrow(
    baseCompanyObjectMetadataItem,
    'id',
  );
  const baseNameFieldMetadataItem = getFieldMetadataItemOrThrow(
    baseCompanyObjectMetadataItem,
    'name',
  );

  return [
    {
      ...baseIdFieldMetadataItem,
      id: idFieldId,
      universalIdentifier: idFieldUniversalIdentifier,
      objectMetadataId,
    },
    {
      ...baseNameFieldMetadataItem,
      id: nameFieldId,
      universalIdentifier: nameFieldUniversalIdentifier,
      description,
      icon,
      isCustom: true,
      objectMetadataId,
    },
  ];
}

function renameLeadObjectLabels(
  flatObjects: FlatObjectMetadataItem[],
): FlatObjectMetadataItem[] {
  return flatObjects.map((flatObject) =>
    flatObject.nameSingular === 'person'
      ? {
          ...flatObject,
          labelSingular: 'Lead',
          labelPlural: 'Leads',
          description: 'A lead',
        }
      : flatObject,
  );
}

function renameLeadIndexView(flatViews: FlatView[]): FlatView[] {
  return flatViews.map((flatView) =>
    flatView.name === 'All People'
      ? { ...flatView, name: 'All Leads' }
      : flatView,
  );
}

export function extendSignInBackgroundMockedMetadata({
  flatObjects,
  flatFields,
  flatViews,
}: {
  flatObjects: FlatObjectMetadataItem[];
  flatFields: FlatFieldMetadataItem[];
  flatViews: FlatView[];
}) {
  const metadataIds = getSignInBackgroundMockMetadataIds();
  const personObjectMetadataItem = flatObjects.find(
    (flatObject) => flatObject.nameSingular === 'person',
  );

  if (!isDefined(personObjectMetadataItem)) {
    throw new Error('Missing person object metadata for sign-in background');
  }

  return {
    flatObjects: [
      ...renameLeadObjectLabels(flatObjects),
      createSimpleCustomObjectMetadataItem({
        objectId: metadataIds.objects.leadSource,
        universalIdentifier:
          metadataIds.universalIdentifiers.objects.leadSource,
        nameSingular: 'leadSource',
        namePlural: 'leadSources',
        labelSingular: 'Lead Source',
        labelPlural: 'Lead Sources',
        description: 'A lead source',
        icon: 'IconTargetArrow',
      }),
      createSimpleCustomObjectMetadataItem({
        objectId: metadataIds.objects.policy,
        universalIdentifier: metadataIds.universalIdentifiers.objects.policy,
        nameSingular: 'policy',
        namePlural: 'policies',
        labelSingular: 'Policy',
        labelPlural: 'Policies',
        description: 'A policy',
        icon: 'IconShield',
      }),
    ],
    flatFields: [
      ...flatFields,
      ...getSignInBackgroundMockPersonCustomFieldMetadataItems().map(
        (field) => ({
          ...field,
          objectMetadataId: personObjectMetadataItem.id,
        }),
      ),
      ...createSimpleCustomObjectFieldMetadataItems({
        objectMetadataId: metadataIds.objects.leadSource,
        idFieldId: metadataIds.fields.leadSource.id,
        idFieldUniversalIdentifier:
          metadataIds.universalIdentifiers.leadSource.id,
        nameFieldId: metadataIds.fields.leadSource.name,
        nameFieldUniversalIdentifier:
          metadataIds.universalIdentifiers.leadSource.name,
        description: 'Lead source name',
        icon: 'IconTargetArrow',
      }),
      ...createSimpleCustomObjectFieldMetadataItems({
        objectMetadataId: metadataIds.objects.policy,
        idFieldId: metadataIds.fields.policy.id,
        idFieldUniversalIdentifier: metadataIds.universalIdentifiers.policy.id,
        nameFieldId: metadataIds.fields.policy.name,
        nameFieldUniversalIdentifier:
          metadataIds.universalIdentifiers.policy.name,
        description: 'Policy name',
        icon: 'IconShield',
      }),
    ],
    flatViews: renameLeadIndexView(flatViews),
  };
}
