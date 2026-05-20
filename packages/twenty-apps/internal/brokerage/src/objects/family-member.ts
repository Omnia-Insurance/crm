import {
  defineObject,
  FieldType,
  OnDeleteAction,
  RelationType,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import { FAMILY_MEMBER_TYPE_OPTIONS } from 'src/constants/field-options';
import {
  FAMILY_MEMBER_DATE_OF_BIRTH_FIELD_ID,
  FAMILY_MEMBER_LEAD_FIELD_ID,
  FAMILY_MEMBER_MEMBER_TYPE_FIELD_ID,
  FAMILY_MEMBER_NAME_FIELD_ID,
  FAMILY_MEMBER_OBJECT_UNIVERSAL_IDENTIFIER,
  LEAD_FAMILY_MEMBERS_FIELD_ID,
} from 'src/constants/universal-identifiers';

export default defineObject({
  universalIdentifier: FAMILY_MEMBER_OBJECT_UNIVERSAL_IDENTIFIER,
  nameSingular: 'familyMember',
  namePlural: 'familyMembers',
  labelSingular: 'Family Member',
  labelPlural: 'Family Members',
  description: 'Family member attached to a lead.',
  icon: 'IconUsers',
  labelIdentifierFieldMetadataUniversalIdentifier: FAMILY_MEMBER_NAME_FIELD_ID,
  fields: [
    {
      universalIdentifier: FAMILY_MEMBER_NAME_FIELD_ID,
      type: FieldType.TEXT,
      name: 'name',
      label: 'Name',
      icon: 'IconAbc',
    },
    {
      universalIdentifier: FAMILY_MEMBER_DATE_OF_BIRTH_FIELD_ID,
      type: FieldType.DATE,
      name: 'dateOfBirth',
      label: 'Date of Birth',
      icon: 'IconCake',
    },
    {
      universalIdentifier: FAMILY_MEMBER_MEMBER_TYPE_FIELD_ID,
      type: FieldType.SELECT,
      name: 'memberType',
      label: 'Type',
      icon: 'IconUsers',
      options: FAMILY_MEMBER_TYPE_OPTIONS,
    },
    {
      universalIdentifier: FAMILY_MEMBER_LEAD_FIELD_ID,
      type: FieldType.RELATION,
      name: 'lead',
      label: 'Lead',
      icon: 'IconTargetArrow',
      relationTargetObjectMetadataUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
      relationTargetFieldMetadataUniversalIdentifier:
        LEAD_FAMILY_MEMBERS_FIELD_ID,
      universalSettings: {
        relationType: RelationType.MANY_TO_ONE,
        onDelete: OnDeleteAction.SET_NULL,
        joinColumnName: 'leadId',
      },
    },
  ],
});

