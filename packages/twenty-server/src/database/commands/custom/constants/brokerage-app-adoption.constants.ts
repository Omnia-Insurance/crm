import { STANDARD_OBJECTS } from 'twenty-shared/metadata';
import { v5 as uuidV5 } from 'uuid';

import { NavigationMenuItemType } from 'src/engine/metadata-modules/navigation-menu-item/enums/navigation-menu-item-type.enum';

export type BrokerageAdoptionObject = {
  nameSingular: string;
  labelSingular: string;
  labelPlural: string;
  universalIdentifier: string;
};

export type BrokerageAdoptionField = {
  objectUniversalIdentifier: string;
  name: string;
  universalIdentifier: string;
  description: string | null;
  isLabelSyncedWithName: boolean;
  isUnique: boolean;
  settingsPatch?: Record<string, unknown>;
};

type BrokerageAdoptionFieldInput = Omit<
  BrokerageAdoptionField,
  'description' | 'isLabelSyncedWithName' | 'isUnique'
> &
  Partial<
    Pick<
      BrokerageAdoptionField,
      'description' | 'isLabelSyncedWithName' | 'isUnique' | 'settingsPatch'
    >
  >;

export type BrokerageAdoptionNavigationMenuItem = {
  universalIdentifier: string;
  type: NavigationMenuItemType;
  name: string | null;
  targetObjectUniversalIdentifier: string | null;
  folderUniversalIdentifier: string | null;
};

export const BROKERAGE_APP_UNIVERSAL_IDENTIFIER =
  'ddc5e4cf-d4d7-4fa6-ae1d-d86e878661c9';
export const BROKERAGE_AGENT_ROLE_UNIVERSAL_IDENTIFIER =
  '76007a24-574b-4b62-80f5-0299d808ad8b';

const APPLICATION_GENERATED_FIELD_NAMESPACE =
  '142046f0-4d80-48b5-ad56-26ad410e895c';
const ROLE_UNIVERSAL_IDENTIFIER_NAMESPACE =
  'b403ec59-4d80-4f22-85e6-717a192dc9cb';

const getRoleObjectPermissionUniversalIdentifier = ({
  roleUniversalIdentifier,
  objectUniversalIdentifier,
}: {
  roleUniversalIdentifier: string;
  objectUniversalIdentifier: string;
}) =>
  uuidV5(
    `${roleUniversalIdentifier}:${objectUniversalIdentifier}`,
    ROLE_UNIVERSAL_IDENTIFIER_NAMESPACE,
  );

const getRoleFieldPermissionUniversalIdentifier = ({
  roleUniversalIdentifier,
  objectUniversalIdentifier,
  fieldUniversalIdentifier,
}: {
  roleUniversalIdentifier: string;
  objectUniversalIdentifier: string;
  fieldUniversalIdentifier: string;
}) =>
  uuidV5(
    `${roleUniversalIdentifier}:${objectUniversalIdentifier}:${fieldUniversalIdentifier}`,
    ROLE_UNIVERSAL_IDENTIFIER_NAMESPACE,
  );

const generatedCustomObjectFieldNames = [
  'id',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'createdBy',
  'updatedBy',
  'position',
  'searchVector',
  'timelineActivities',
  'attachments',
  'noteTargets',
  'taskTargets',
] satisfies string[];

const generatedDefaultRelationFields = [
  {
    fieldName: 'timelineActivities',
    targetObjectUniversalIdentifier:
      STANDARD_OBJECTS.timelineActivity.universalIdentifier,
  },
  {
    fieldName: 'attachments',
    targetObjectUniversalIdentifier:
      STANDARD_OBJECTS.attachment.universalIdentifier,
  },
  {
    fieldName: 'noteTargets',
    targetObjectUniversalIdentifier:
      STANDARD_OBJECTS.noteTarget.universalIdentifier,
  },
  {
    fieldName: 'taskTargets',
    targetObjectUniversalIdentifier:
      STANDARD_OBJECTS.taskTarget.universalIdentifier,
  },
] satisfies {
  fieldName: string;
  targetObjectUniversalIdentifier: string;
}[];

const getGeneratedFieldUniversalIdentifier = ({
  objectUniversalIdentifier,
  fieldName,
}: {
  objectUniversalIdentifier: string;
  fieldName: string;
}) =>
  uuidV5(
    `${objectUniversalIdentifier}-${fieldName}`,
    APPLICATION_GENERATED_FIELD_NAMESPACE,
  );

const getPascalCaseName = (name: string) =>
  `${name.charAt(0).toUpperCase()}${name.slice(1)}`;

const getTargetFieldName = (nameSingular: string) =>
  `target${getPascalCaseName(nameSingular)}`;

const generatedSystemFieldDescriptionByName = new Map<string, string>([
  ['id', 'Id'],
  ['createdAt', 'Creation date'],
  ['updatedAt', 'Last time the record was changed'],
  ['deletedAt', 'Deletion date'],
  ['createdBy', 'The creator of the record'],
  ['updatedBy', 'The workspace member who last updated the record'],
  ['position', 'Position'],
  ['searchVector', 'Search vector'],
]);

const createBrokerageAdoptionField = ({
  description = null,
  isLabelSyncedWithName = false,
  isUnique = false,
  name,
  objectUniversalIdentifier,
  settingsPatch,
  universalIdentifier,
}: BrokerageAdoptionFieldInput): BrokerageAdoptionField => ({
  description,
  isLabelSyncedWithName,
  isUnique,
  name,
  objectUniversalIdentifier,
  settingsPatch,
  universalIdentifier,
});

const getGeneratedCustomObjectFieldDescription = ({
  fieldName,
  object,
}: {
  fieldName: string;
  object: BrokerageAdoptionObject;
}) => {
  const systemFieldDescription =
    generatedSystemFieldDescriptionByName.get(fieldName);

  if (systemFieldDescription !== undefined) {
    return systemFieldDescription;
  }

  if (
    generatedDefaultRelationFields.some(
      (defaultRelationField) => defaultRelationField.fieldName === fieldName,
    )
  ) {
    return `${object.labelPlural} tied to the ${getPascalCaseName(
      object.nameSingular,
    )}`;
  }

  return null;
};

export const BROKERAGE_ADOPTION_OBJECTS = [
  {
    nameSingular: 'call',
    labelSingular: 'Call',
    labelPlural: 'Calls',
    universalIdentifier: '07f196c2-1e42-47e8-a882-fcf00cd01b16',
  },
  {
    nameSingular: 'product',
    labelSingular: 'Product',
    labelPlural: 'Products',
    universalIdentifier: '2a4b3f5b-3501-4903-9bb7-b494d58248da',
  },
  {
    nameSingular: 'leadSource',
    labelSingular: 'Lead Source',
    labelPlural: 'Lead Sources',
    universalIdentifier: '3a2a8707-b67f-4197-8f70-2016755da912',
  },
  {
    nameSingular: 'policy',
    labelSingular: 'Policy',
    labelPlural: 'Policies',
    universalIdentifier: '472de508-d9c1-4e5a-92f6-6820b7e56929',
  },
  {
    nameSingular: 'carrierProduct',
    labelSingular: 'Carrier Product',
    labelPlural: 'Carrier Products',
    universalIdentifier: '4a2121e0-2b1c-4b1d-b82d-d8a9cbb71aa1',
  },
  {
    nameSingular: 'familyMember',
    labelSingular: 'Family Member',
    labelPlural: 'Family Members',
    universalIdentifier: '577cb4a1-6aaf-48c0-87c9-caf52653fbf2',
  },
  {
    nameSingular: 'carrier',
    labelSingular: 'Carrier',
    labelPlural: 'Carriers',
    universalIdentifier: '5fc52fc5-9df2-42fe-81e0-77b4731dffd7',
  },
  {
    nameSingular: 'productType',
    labelSingular: 'Product Type',
    labelPlural: 'Product Types',
    universalIdentifier: 'f3229aea-0da9-420a-94c8-2c7d55d1ea99',
  },
  {
    nameSingular: 'agentProfile',
    labelSingular: 'Agent',
    labelPlural: 'Agents',
    universalIdentifier: 'f63fe6ff-3334-4143-9ec1-67f491d8127c',
  },
] satisfies BrokerageAdoptionObject[];

const brokerageBusinessFields = (
  [
    {
      objectUniversalIdentifier: '07f196c2-1e42-47e8-a882-fcf00cd01b16',
      name: 'name',
      universalIdentifier: '99da6f6e-0b29-44e4-a003-f34fdfbbfec3',
    },
    {
      objectUniversalIdentifier: '07f196c2-1e42-47e8-a882-fcf00cd01b16',
      name: 'direction',
      universalIdentifier: '3541eee7-420b-4c1c-9911-887919c73fbb',
    },
    {
      objectUniversalIdentifier: '07f196c2-1e42-47e8-a882-fcf00cd01b16',
      name: 'duration',
      universalIdentifier: '9464cd65-d810-4001-b900-6ed5206621c4',
    },
    {
      objectUniversalIdentifier: '07f196c2-1e42-47e8-a882-fcf00cd01b16',
      name: 'callDate',
      universalIdentifier: 'a6a85402-3470-448d-9f05-c8a31d3a224c',
    },
    {
      objectUniversalIdentifier: '07f196c2-1e42-47e8-a882-fcf00cd01b16',
      name: 'cost',
      universalIdentifier: 'c2e3a279-9ed3-488d-9bd3-d4b6cfe833b0',
    },
    {
      objectUniversalIdentifier: '07f196c2-1e42-47e8-a882-fcf00cd01b16',
      name: 'billable',
      universalIdentifier: 'ee26af4b-fe5b-4a27-8e69-33975e14d995',
    },
    {
      objectUniversalIdentifier: '07f196c2-1e42-47e8-a882-fcf00cd01b16',
      name: 'status',
      universalIdentifier: '3285a047-82db-4ace-8230-5de3f2127982',
    },
    {
      objectUniversalIdentifier: '07f196c2-1e42-47e8-a882-fcf00cd01b16',
      name: 'statusName',
      universalIdentifier: 'c020f633-b65a-4948-a087-54d40c56fe6f',
    },
    {
      objectUniversalIdentifier: '07f196c2-1e42-47e8-a882-fcf00cd01b16',
      name: 'queueName',
      universalIdentifier: '3c4703b1-bade-49fe-bac5-83a3534d4e80',
    },
    {
      objectUniversalIdentifier: '07f196c2-1e42-47e8-a882-fcf00cd01b16',
      name: 'recording',
      universalIdentifier: 'ba0c9184-9fa8-4811-87aa-b2e7bb1f4beb',
    },
    {
      objectUniversalIdentifier: '07f196c2-1e42-47e8-a882-fcf00cd01b16',
      name: 'agent',
      universalIdentifier: '00699882-86db-4c2b-be69-a40ff87e33d3',
    },
    {
      objectUniversalIdentifier: '07f196c2-1e42-47e8-a882-fcf00cd01b16',
      name: 'lead',
      universalIdentifier: '4089a75f-aecd-4410-9077-836e6de23590',
    },
    {
      objectUniversalIdentifier: '07f196c2-1e42-47e8-a882-fcf00cd01b16',
      name: 'leadSource',
      universalIdentifier: '911b8db1-2b85-4c16-8437-3b830e6a47b1',
    },
    {
      objectUniversalIdentifier: '2a4b3f5b-3501-4903-9bb7-b494d58248da',
      name: 'name',
      universalIdentifier: '0ad6147a-69fc-4e69-b0f9-6e10eacffdad',
    },
    {
      objectUniversalIdentifier: '2a4b3f5b-3501-4903-9bb7-b494d58248da',
      name: 'active',
      universalIdentifier: 'dcfd948d-5bab-4bf1-9070-f699166a86b1',
    },
    {
      objectUniversalIdentifier: '2a4b3f5b-3501-4903-9bb7-b494d58248da',
      name: 'productType',
      universalIdentifier: 'cd69057b-ba88-4b7d-8260-6138c0ccfb51',
    },
    {
      objectUniversalIdentifier: '2a4b3f5b-3501-4903-9bb7-b494d58248da',
      name: 'policies',
      universalIdentifier: '5d925021-4992-458b-be82-62dbd5e5308d',
    },
    {
      objectUniversalIdentifier: '2a4b3f5b-3501-4903-9bb7-b494d58248da',
      name: 'productCarriers',
      universalIdentifier: '7cfa0a3a-3d10-4d61-bda3-16da5338370f',
      settingsPatch: {
        relationType: 'ONE_TO_MANY',
        junctionTargetFieldUniversalIdentifier:
          '889b623b-5127-4c18-9be8-6705567a2dce',
      },
    },
    {
      objectUniversalIdentifier: '3a2a8707-b67f-4197-8f70-2016755da912',
      name: 'name',
      universalIdentifier: '9a30af4d-a07a-4430-aead-628efe6cd6a5',
    },
    {
      objectUniversalIdentifier: '3a2a8707-b67f-4197-8f70-2016755da912',
      name: 'active',
      universalIdentifier: '9fa91598-56c7-41df-acea-38d6acdcf22c',
    },
    {
      objectUniversalIdentifier: '3a2a8707-b67f-4197-8f70-2016755da912',
      name: 'costPerCall',
      universalIdentifier: 'c2d37d38-bd65-4e7c-b9be-0749cb62814f',
    },
    {
      objectUniversalIdentifier: '3a2a8707-b67f-4197-8f70-2016755da912',
      name: 'minimumCallDuration',
      universalIdentifier: '64d97658-843e-4fb9-8dcb-7dd9aad01702',
    },
    {
      objectUniversalIdentifier: '3a2a8707-b67f-4197-8f70-2016755da912',
      name: 'leads',
      universalIdentifier: 'd3d9e638-8962-419f-8d5c-1db7a10b1a14',
    },
    {
      objectUniversalIdentifier: '3a2a8707-b67f-4197-8f70-2016755da912',
      name: 'calls',
      universalIdentifier: 'd4c95e8b-908e-453d-9725-88601d796b73',
    },
    {
      objectUniversalIdentifier: '472de508-d9c1-4e5a-92f6-6820b7e56929',
      name: 'name',
      universalIdentifier: '9549b3b5-fa53-4765-a11d-b41c55c75ea9',
    },
    {
      objectUniversalIdentifier: '472de508-d9c1-4e5a-92f6-6820b7e56929',
      name: 'policyNumber',
      universalIdentifier: '8d7b933d-d639-4c3f-b1c0-36cce6aea3ed',
    },
    {
      objectUniversalIdentifier: '472de508-d9c1-4e5a-92f6-6820b7e56929',
      name: 'applicationId',
      universalIdentifier: '5964a53a-f795-4f14-a4bb-3b9ea983bca2',
    },
    {
      objectUniversalIdentifier: '472de508-d9c1-4e5a-92f6-6820b7e56929',
      name: 'status',
      universalIdentifier: '52a2e00d-0393-4122-9137-8db9d736919c',
    },
    {
      objectUniversalIdentifier: '472de508-d9c1-4e5a-92f6-6820b7e56929',
      name: 'premium',
      universalIdentifier: '6f45e08f-568d-4454-bb92-bc3953a29213',
    },
    {
      objectUniversalIdentifier: '472de508-d9c1-4e5a-92f6-6820b7e56929',
      name: 'ltv',
      universalIdentifier: '1004a042-afaa-457b-8a2c-b1b42a9bf476',
    },
    {
      objectUniversalIdentifier: '472de508-d9c1-4e5a-92f6-6820b7e56929',
      name: 'applicantCount',
      universalIdentifier: '20257e46-9bcd-46fb-a791-3e3e6f558432',
    },
    {
      objectUniversalIdentifier: '472de508-d9c1-4e5a-92f6-6820b7e56929',
      name: 'submittedDate',
      universalIdentifier: '62e9c34a-c39e-4d55-ac14-132663c02464',
    },
    {
      objectUniversalIdentifier: '472de508-d9c1-4e5a-92f6-6820b7e56929',
      name: 'effectiveDate',
      universalIdentifier: 'ad5ce496-ba8d-44db-84d2-8b65dd2ab332',
    },
    {
      objectUniversalIdentifier: '472de508-d9c1-4e5a-92f6-6820b7e56929',
      name: 'expirationDate',
      universalIdentifier: '8ae94635-74c0-400a-bea6-10a7c0b3d81c',
    },
    {
      objectUniversalIdentifier: '472de508-d9c1-4e5a-92f6-6820b7e56929',
      name: 'paidThroughDate',
      universalIdentifier: '421bdead-7bde-483f-a0b2-570b32c5c639',
    },
    {
      objectUniversalIdentifier: '472de508-d9c1-4e5a-92f6-6820b7e56929',
      name: 'lead',
      universalIdentifier: '1c0a0e0e-7c21-4b4e-a54b-0a07eb5f5bfd',
    },
    {
      objectUniversalIdentifier: '472de508-d9c1-4e5a-92f6-6820b7e56929',
      name: 'carrier',
      universalIdentifier: 'e8153b3b-7934-4a03-9193-bf17dac6c901',
    },
    {
      objectUniversalIdentifier: '472de508-d9c1-4e5a-92f6-6820b7e56929',
      name: 'product',
      universalIdentifier: '7ecc4531-2a78-44aa-af6c-180ae55d8e89',
    },
    {
      objectUniversalIdentifier: '472de508-d9c1-4e5a-92f6-6820b7e56929',
      name: 'agent',
      universalIdentifier: '1e19fa45-edcf-4df6-bb3c-29ad46e5fa6e',
    },
    {
      objectUniversalIdentifier: '4a2121e0-2b1c-4b1d-b82d-d8a9cbb71aa1',
      name: 'name',
      universalIdentifier: '3b6ceaf3-6dd1-4123-88f9-23812b22028a',
    },
    {
      objectUniversalIdentifier: '4a2121e0-2b1c-4b1d-b82d-d8a9cbb71aa1',
      name: 'commission',
      universalIdentifier: 'b0bb4737-48d6-422e-9a5f-ccfa74c1c936',
    },
    {
      objectUniversalIdentifier: '4a2121e0-2b1c-4b1d-b82d-d8a9cbb71aa1',
      name: 'active',
      universalIdentifier: 'f4d93a9c-b13d-4315-9f1a-af9ff334d3f4',
    },
    {
      objectUniversalIdentifier: '4a2121e0-2b1c-4b1d-b82d-d8a9cbb71aa1',
      name: 'statesAvailable',
      universalIdentifier: '9d16f3a0-d01f-4d07-995e-dc5f70363c90',
    },
    {
      objectUniversalIdentifier: '4a2121e0-2b1c-4b1d-b82d-d8a9cbb71aa1',
      name: 'carrier',
      universalIdentifier: '889b623b-5127-4c18-9be8-6705567a2dce',
    },
    {
      objectUniversalIdentifier: '4a2121e0-2b1c-4b1d-b82d-d8a9cbb71aa1',
      name: 'product',
      universalIdentifier: '0f06e0be-7f1c-4af2-bb0f-22a295fecd2e',
    },
    {
      objectUniversalIdentifier: '577cb4a1-6aaf-48c0-87c9-caf52653fbf2',
      name: 'name',
      universalIdentifier: 'c051e407-dad4-4771-9e37-90cac9177545',
    },
    {
      objectUniversalIdentifier: '577cb4a1-6aaf-48c0-87c9-caf52653fbf2',
      name: 'dateOfBirth',
      universalIdentifier: 'eef9a21b-913e-4463-9264-ac764aa21e05',
    },
    {
      objectUniversalIdentifier: '577cb4a1-6aaf-48c0-87c9-caf52653fbf2',
      name: 'memberType',
      universalIdentifier: '97922f01-3eb0-4d5d-b15e-0585fd2f6edf',
    },
    {
      objectUniversalIdentifier: '577cb4a1-6aaf-48c0-87c9-caf52653fbf2',
      name: 'lead',
      universalIdentifier: '3eb5d9b0-6971-466d-979e-84c52d57b240',
    },
    {
      objectUniversalIdentifier: '5fc52fc5-9df2-42fe-81e0-77b4731dffd7',
      name: 'name',
      universalIdentifier: '4e6d3b14-8b98-4cc4-a99f-fb830e0339b1',
    },
    {
      objectUniversalIdentifier: '5fc52fc5-9df2-42fe-81e0-77b4731dffd7',
      name: 'active',
      universalIdentifier: '7a2f8bd5-940c-40aa-afbd-9869be95fb83',
    },
    {
      objectUniversalIdentifier: '5fc52fc5-9df2-42fe-81e0-77b4731dffd7',
      name: 'policies',
      universalIdentifier: 'f580823f-5e5d-4f98-ac8c-b3ce31396381',
    },
    {
      objectUniversalIdentifier: '5fc52fc5-9df2-42fe-81e0-77b4731dffd7',
      name: 'carrierProducts',
      universalIdentifier: '7f446417-3d8d-47e3-9d36-b87f1d08034c',
      settingsPatch: {
        relationType: 'ONE_TO_MANY',
        junctionTargetFieldUniversalIdentifier:
          '0f06e0be-7f1c-4af2-bb0f-22a295fecd2e',
      },
    },
    {
      objectUniversalIdentifier: 'f3229aea-0da9-420a-94c8-2c7d55d1ea99',
      name: 'name',
      universalIdentifier: '7f4c59b2-5cb2-4e87-8f67-e835c2ad8e3f',
    },
    {
      objectUniversalIdentifier: 'f3229aea-0da9-420a-94c8-2c7d55d1ea99',
      name: 'products',
      universalIdentifier: '499c9a9e-fab2-4cc1-9655-2f9ebcc449ca',
    },
    {
      objectUniversalIdentifier: 'f63fe6ff-3334-4143-9ec1-67f491d8127c',
      name: 'name',
      universalIdentifier: '77ae9a3f-4697-41c5-b2f9-e38f65c602b4',
    },
    {
      objectUniversalIdentifier: 'f63fe6ff-3334-4143-9ec1-67f491d8127c',
      name: 'email',
      universalIdentifier: 'e1a24f7f-9048-4054-9ea2-183ba7a4af3c',
    },
    {
      objectUniversalIdentifier: 'f63fe6ff-3334-4143-9ec1-67f491d8127c',
      name: 'npn',
      universalIdentifier: 'b5148949-ee3e-4b77-8e58-f6a44a80e7b2',
    },
    {
      objectUniversalIdentifier: 'f63fe6ff-3334-4143-9ec1-67f491d8127c',
      name: 'status',
      universalIdentifier: '42c8d623-219d-4e73-ae72-1a2d3f553d28',
    },
    {
      objectUniversalIdentifier: 'f63fe6ff-3334-4143-9ec1-67f491d8127c',
      name: 'workspaceMember',
      universalIdentifier: 'e3397872-6b91-4b39-a946-abb9f4ecfe20',
    },
    {
      objectUniversalIdentifier: 'f63fe6ff-3334-4143-9ec1-67f491d8127c',
      name: 'leads',
      universalIdentifier: '9559bbf6-3d51-43cf-9299-95719cfa9937',
    },
    {
      objectUniversalIdentifier: 'f63fe6ff-3334-4143-9ec1-67f491d8127c',
      name: 'policies',
      universalIdentifier: '5b1af864-781f-4f68-a2cb-cc8e983f00e1',
    },
    {
      objectUniversalIdentifier: 'f63fe6ff-3334-4143-9ec1-67f491d8127c',
      name: 'calls',
      universalIdentifier: '61406e1a-3865-4a63-88d2-6bc98a3cb71c',
    },
    {
      objectUniversalIdentifier: STANDARD_OBJECTS.person.universalIdentifier,
      name: 'policies',
      universalIdentifier: '24929185-c0b5-490e-ad15-ac504883291e',
    },
    {
      objectUniversalIdentifier: STANDARD_OBJECTS.person.universalIdentifier,
      name: 'assignedAgent',
      universalIdentifier: '2c047e62-8b61-4057-b7ed-2f7a30ba4ba8',
    },
    {
      objectUniversalIdentifier: STANDARD_OBJECTS.person.universalIdentifier,
      name: 'gender',
      universalIdentifier: '32ae18fb-674d-45f8-b68a-d27c8877be1d',
    },
    {
      objectUniversalIdentifier: STANDARD_OBJECTS.person.universalIdentifier,
      name: 'leadStatus',
      universalIdentifier: '356d9f87-d2e2-4f50-8088-d7e4f942b310',
    },
    {
      objectUniversalIdentifier: STANDARD_OBJECTS.person.universalIdentifier,
      name: 'doNotEmail',
      universalIdentifier: '38fd8e5b-d436-4d3b-8078-851c2b50b443',
    },
    {
      objectUniversalIdentifier: STANDARD_OBJECTS.person.universalIdentifier,
      name: 'calls',
      universalIdentifier: '460e752e-15fc-4f02-9a30-2aa5a06c2514',
    },
    {
      objectUniversalIdentifier: STANDARD_OBJECTS.person.universalIdentifier,
      name: 'leadSource',
      universalIdentifier: '7ce3e06d-bd49-4162-b3e5-7535fd206614',
    },
    {
      objectUniversalIdentifier: STANDARD_OBJECTS.person.universalIdentifier,
      name: 'doNotCall',
      universalIdentifier: '7dada0be-7e9a-42ee-8bc8-3ace38ead418',
    },
    {
      objectUniversalIdentifier:
        STANDARD_OBJECTS.workspaceMember.universalIdentifier,
      name: 'agentProfile',
      universalIdentifier: 'ca5a60cc-6f63-4641-8e6c-935d106d5d6b',
    },
    {
      objectUniversalIdentifier: STANDARD_OBJECTS.person.universalIdentifier,
      name: 'familyMembers',
      universalIdentifier: 'f226ed02-4b00-42e5-b8eb-f26d1480cf4f',
    },
    {
      objectUniversalIdentifier: STANDARD_OBJECTS.person.universalIdentifier,
      name: 'addressCustom',
      universalIdentifier: 'f3fc65ba-ca1b-47f5-b77e-2acfd8076533',
    },
    {
      objectUniversalIdentifier: STANDARD_OBJECTS.person.universalIdentifier,
      name: 'dateOfBirth',
      universalIdentifier: 'fa26ae59-94ad-4fef-8427-d97164eea7b1',
    },
  ] satisfies BrokerageAdoptionFieldInput[]
).map(createBrokerageAdoptionField);

export const BROKERAGE_ADOPTION_FIELDS: BrokerageAdoptionField[] = [
  ...brokerageBusinessFields,
  ...BROKERAGE_ADOPTION_OBJECTS.flatMap((object) =>
    generatedCustomObjectFieldNames.map((fieldName) => ({
      objectUniversalIdentifier: object.universalIdentifier,
      name: fieldName,
      universalIdentifier: getGeneratedFieldUniversalIdentifier({
        objectUniversalIdentifier: object.universalIdentifier,
        fieldName,
      }),
      description: getGeneratedCustomObjectFieldDescription({
        fieldName,
        object,
      }),
      isLabelSyncedWithName: false,
      isUnique: false,
    })),
  ),
  ...BROKERAGE_ADOPTION_OBJECTS.flatMap((object) =>
    generatedDefaultRelationFields.map(
      ({ fieldName, targetObjectUniversalIdentifier }) => ({
        objectUniversalIdentifier: targetObjectUniversalIdentifier,
        name: getTargetFieldName(object.nameSingular),
        universalIdentifier: getGeneratedFieldUniversalIdentifier({
          objectUniversalIdentifier: object.universalIdentifier,
          fieldName: `${fieldName}Inverse`,
        }),
        description: `${getPascalCaseName(object.nameSingular)} ${
          object.labelSingular
        }`,
        isLabelSyncedWithName: false,
        isUnique: false,
      }),
    ),
  ),
] satisfies BrokerageAdoptionField[];

export const BROKERAGE_ADOPTION_NAVIGATION_MENU_ITEMS = [
  {
    universalIdentifier: 'adfe96ce-2bfd-429d-a748-bd08030bc80f',
    type: NavigationMenuItemType.OBJECT,
    name: null,
    targetObjectUniversalIdentifier:
      STANDARD_OBJECTS.person.universalIdentifier,
    folderUniversalIdentifier: null,
  },
  {
    universalIdentifier: 'e0d96a22-b018-4a6c-bbbe-79bc079c4388',
    type: NavigationMenuItemType.OBJECT,
    name: null,
    targetObjectUniversalIdentifier: '472de508-d9c1-4e5a-92f6-6820b7e56929',
    folderUniversalIdentifier: null,
  },
  {
    universalIdentifier: 'd28cfd12-74e9-46da-92ee-cd08b8e3b4a2',
    type: NavigationMenuItemType.OBJECT,
    name: null,
    targetObjectUniversalIdentifier: '07f196c2-1e42-47e8-a882-fcf00cd01b16',
    folderUniversalIdentifier: null,
  },
  {
    universalIdentifier: '9bf38846-4c0e-44ac-b303-dcc07da58fde',
    type: NavigationMenuItemType.OBJECT,
    name: null,
    targetObjectUniversalIdentifier: '3a2a8707-b67f-4197-8f70-2016755da912',
    folderUniversalIdentifier: null,
  },
  {
    universalIdentifier: '4b27a9c8-ff4e-49e0-a492-f3dae79915f0',
    type: NavigationMenuItemType.OBJECT,
    name: null,
    targetObjectUniversalIdentifier: 'f63fe6ff-3334-4143-9ec1-67f491d8127c',
    folderUniversalIdentifier: null,
  },
  {
    universalIdentifier: '5b41d8fd-53ac-4fc5-a883-e365fe23c1a4',
    type: NavigationMenuItemType.FOLDER,
    name: 'Carriers',
    targetObjectUniversalIdentifier: null,
    folderUniversalIdentifier: null,
  },
  {
    universalIdentifier: '0c6cd3e7-6e36-4ef4-afca-b80c5f742a88',
    type: NavigationMenuItemType.OBJECT,
    name: null,
    targetObjectUniversalIdentifier: '5fc52fc5-9df2-42fe-81e0-77b4731dffd7',
    folderUniversalIdentifier: '5b41d8fd-53ac-4fc5-a883-e365fe23c1a4',
  },
  {
    universalIdentifier: 'bcbeb78c-58cb-423f-8425-c5d4b6474b56',
    type: NavigationMenuItemType.OBJECT,
    name: null,
    targetObjectUniversalIdentifier: '2a4b3f5b-3501-4903-9bb7-b494d58248da',
    folderUniversalIdentifier: '5b41d8fd-53ac-4fc5-a883-e365fe23c1a4',
  },
  {
    universalIdentifier: 'f0665063-69df-4ae4-afa6-49e3b835ad9f',
    type: NavigationMenuItemType.OBJECT,
    name: null,
    targetObjectUniversalIdentifier: 'f3229aea-0da9-420a-94c8-2c7d55d1ea99',
    folderUniversalIdentifier: '5b41d8fd-53ac-4fc5-a883-e365fe23c1a4',
  },
  {
    universalIdentifier: '56fb6e1f-9204-4d71-81b4-9e8b424cc914',
    type: NavigationMenuItemType.OBJECT,
    name: null,
    targetObjectUniversalIdentifier: '4a2121e0-2b1c-4b1d-b82d-d8a9cbb71aa1',
    folderUniversalIdentifier: '5b41d8fd-53ac-4fc5-a883-e365fe23c1a4',
  },
] satisfies BrokerageAdoptionNavigationMenuItem[];

const brokerageAgentRoleObjectPermissionObjectUniversalIdentifiers = [
  STANDARD_OBJECTS.person.universalIdentifier,
  '472de508-d9c1-4e5a-92f6-6820b7e56929',
  STANDARD_OBJECTS.note.universalIdentifier,
  STANDARD_OBJECTS.task.universalIdentifier,
  '577cb4a1-6aaf-48c0-87c9-caf52653fbf2',
  '07f196c2-1e42-47e8-a882-fcf00cd01b16',
  'f63fe6ff-3334-4143-9ec1-67f491d8127c',
  '5fc52fc5-9df2-42fe-81e0-77b4731dffd7',
  '2a4b3f5b-3501-4903-9bb7-b494d58248da',
  'f3229aea-0da9-420a-94c8-2c7d55d1ea99',
  '4a2121e0-2b1c-4b1d-b82d-d8a9cbb71aa1',
  '3a2a8707-b67f-4197-8f70-2016755da912',
] satisfies string[];

export const BROKERAGE_AGENT_ROLE_OBJECT_PERMISSION_ADOPTION = [
  ...brokerageAgentRoleObjectPermissionObjectUniversalIdentifiers.map(
    (objectUniversalIdentifier) => ({
      objectUniversalIdentifier,
      universalIdentifier: getRoleObjectPermissionUniversalIdentifier({
        roleUniversalIdentifier: BROKERAGE_AGENT_ROLE_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier,
      }),
    }),
  ),
] satisfies {
  objectUniversalIdentifier: string;
  universalIdentifier: string;
}[];

const brokerageAgentRoleFieldPermissionIdentifiers = [
  {
    objectUniversalIdentifier: 'f63fe6ff-3334-4143-9ec1-67f491d8127c',
    fieldUniversalIdentifier: 'e1a24f7f-9048-4054-9ea2-183ba7a4af3c',
  },
  {
    objectUniversalIdentifier: 'f63fe6ff-3334-4143-9ec1-67f491d8127c',
    fieldUniversalIdentifier: 'b5148949-ee3e-4b77-8e58-f6a44a80e7b2',
  },
  {
    objectUniversalIdentifier: 'f63fe6ff-3334-4143-9ec1-67f491d8127c',
    fieldUniversalIdentifier: '5b1af864-781f-4f68-a2cb-cc8e983f00e1',
  },
  {
    objectUniversalIdentifier: '07f196c2-1e42-47e8-a882-fcf00cd01b16',
    fieldUniversalIdentifier: 'ee26af4b-fe5b-4a27-8e69-33975e14d995',
  },
  {
    objectUniversalIdentifier: '07f196c2-1e42-47e8-a882-fcf00cd01b16',
    fieldUniversalIdentifier: 'c2e3a279-9ed3-488d-9bd3-d4b6cfe833b0',
  },
  {
    objectUniversalIdentifier: STANDARD_OBJECTS.company.universalIdentifier,
    fieldUniversalIdentifier:
      STANDARD_OBJECTS.company.fields.people.universalIdentifier,
  },
  {
    objectUniversalIdentifier: '3a2a8707-b67f-4197-8f70-2016755da912',
    fieldUniversalIdentifier: 'd3d9e638-8962-419f-8d5c-1db7a10b1a14',
  },
  {
    objectUniversalIdentifier: STANDARD_OBJECTS.person.universalIdentifier,
    fieldUniversalIdentifier:
      STANDARD_OBJECTS.person.fields.avatarUrl.universalIdentifier,
  },
  {
    objectUniversalIdentifier: STANDARD_OBJECTS.person.universalIdentifier,
    fieldUniversalIdentifier:
      STANDARD_OBJECTS.person.fields.company.universalIdentifier,
  },
  {
    objectUniversalIdentifier: STANDARD_OBJECTS.person.universalIdentifier,
    fieldUniversalIdentifier: '7ce3e06d-bd49-4162-b3e5-7535fd206614',
  },
  {
    objectUniversalIdentifier: '472de508-d9c1-4e5a-92f6-6820b7e56929',
    fieldUniversalIdentifier: '1e19fa45-edcf-4df6-bb3c-29ad46e5fa6e',
  },
  {
    objectUniversalIdentifier: '472de508-d9c1-4e5a-92f6-6820b7e56929',
    fieldUniversalIdentifier: '1004a042-afaa-457b-8a2c-b1b42a9bf476',
  },
  {
    objectUniversalIdentifier: '472de508-d9c1-4e5a-92f6-6820b7e56929',
    fieldUniversalIdentifier: '421bdead-7bde-483f-a0b2-570b32c5c639',
  },
  {
    objectUniversalIdentifier: '472de508-d9c1-4e5a-92f6-6820b7e56929',
    fieldUniversalIdentifier: '52a2e00d-0393-4122-9137-8db9d736919c',
  },
  {
    objectUniversalIdentifier: '472de508-d9c1-4e5a-92f6-6820b7e56929',
    fieldUniversalIdentifier: '62e9c34a-c39e-4d55-ac14-132663c02464',
  },
] satisfies {
  objectUniversalIdentifier: string;
  fieldUniversalIdentifier: string;
}[];

export const BROKERAGE_AGENT_ROLE_FIELD_PERMISSION_ADOPTION = [
  ...brokerageAgentRoleFieldPermissionIdentifiers.map(
    ({ objectUniversalIdentifier, fieldUniversalIdentifier }) => ({
      objectUniversalIdentifier,
      fieldUniversalIdentifier,
      universalIdentifier: getRoleFieldPermissionUniversalIdentifier({
        roleUniversalIdentifier: BROKERAGE_AGENT_ROLE_UNIVERSAL_IDENTIFIER,
        objectUniversalIdentifier,
        fieldUniversalIdentifier,
      }),
    }),
  ),
] satisfies {
  objectUniversalIdentifier: string;
  fieldUniversalIdentifier: string;
  universalIdentifier: string;
}[];
