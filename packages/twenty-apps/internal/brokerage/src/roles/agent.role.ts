import {
  defineRole,
  STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS,
} from 'twenty-sdk/define';

import {
  AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
  AGENT_EMAIL_FIELD_ID,
  AGENT_NPN_FIELD_ID,
  AGENT_POLICIES_FIELD_ID,
  BROKERAGE_AGENT_ROLE_UNIVERSAL_IDENTIFIER,
  CALL_BILLABLE_FIELD_ID,
  CALL_COST_FIELD_ID,
  CALL_OBJECT_UNIVERSAL_IDENTIFIER,
  CARRIER_OBJECT_UNIVERSAL_IDENTIFIER,
  CARRIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  FAMILY_MEMBER_OBJECT_UNIVERSAL_IDENTIFIER,
  LEAD_SOURCE_LEADS_FIELD_ID,
  LEAD_SOURCE_OBJECT_UNIVERSAL_IDENTIFIER,
  LEAD_SOURCE_FIELD_ID,
  POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
  POLICY_AGENT_FIELD_ID,
  POLICY_LTV_FIELD_ID,
  POLICY_PAID_THROUGH_DATE_FIELD_ID,
  POLICY_STATUS_FIELD_ID,
  POLICY_SUBMITTED_DATE_FIELD_ID,
  PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
  PRODUCT_TYPE_OBJECT_UNIVERSAL_IDENTIFIER,
} from 'src/constants/universal-identifiers';

type DefineRoleConfig = Parameters<typeof defineRole>[0];

type BrokerageObjectPermissionConfig = NonNullable<
  DefineRoleConfig['objectPermissions']
>[number] & {
  showInSidebar?: boolean;
  editWindowMinutes?: number | null;
};

type BrokerageRoleConfig = Omit<DefineRoleConfig, 'objectPermissions'> & {
  showAllObjectsInSidebar?: boolean;
  objectPermissions?: BrokerageObjectPermissionConfig[];
};

const memberObjectPermission = ({
  objectUniversalIdentifier,
  canUpdateObjectRecords,
  canSoftDeleteObjectRecords,
  canDestroyObjectRecords,
  showInSidebar = false,
}: {
  objectUniversalIdentifier: string;
  canUpdateObjectRecords?: boolean;
  canSoftDeleteObjectRecords?: boolean;
  canDestroyObjectRecords?: boolean;
  showInSidebar?: boolean;
}) => ({
  objectUniversalIdentifier,
  canReadObjectRecords: true,
  ...(canUpdateObjectRecords === undefined ? {} : { canUpdateObjectRecords }),
  ...(canSoftDeleteObjectRecords === undefined
    ? {}
    : { canSoftDeleteObjectRecords }),
  ...(canDestroyObjectRecords === undefined ? {} : { canDestroyObjectRecords }),
  showInSidebar,
});

const restrictedField = ({
  objectUniversalIdentifier,
  fieldUniversalIdentifier,
  canReadFieldValue,
  canUpdateFieldValue,
}: {
  objectUniversalIdentifier: string;
  fieldUniversalIdentifier: string;
  canReadFieldValue?: boolean;
  canUpdateFieldValue?: boolean;
}) => ({
  objectUniversalIdentifier,
  fieldUniversalIdentifier,
  ...(canReadFieldValue === undefined ? {} : { canReadFieldValue }),
  ...(canUpdateFieldValue === undefined ? {} : { canUpdateFieldValue }),
});

const agentRoleConfig: BrokerageRoleConfig = {
  universalIdentifier: BROKERAGE_AGENT_ROLE_UNIVERSAL_IDENTIFIER,
  label: 'Agent',
  description: 'Agent role',
  icon: 'IconUser',
  canUpdateAllSettings: false,
  canAccessAllTools: false,
  canReadAllObjectRecords: true,
  canUpdateAllObjectRecords: false,
  canSoftDeleteAllObjectRecords: false,
  canDestroyAllObjectRecords: false,
  showAllObjectsInSidebar: false,
  canBeAssignedToAgents: false,
  canBeAssignedToUsers: true,
  canBeAssignedToApiKeys: false,
  objectPermissions: [
    memberObjectPermission({
      objectUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
      canUpdateObjectRecords: true,
      canSoftDeleteObjectRecords: false,
      canDestroyObjectRecords: false,
      showInSidebar: true,
    }),
    memberObjectPermission({
      objectUniversalIdentifier: POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
      canUpdateObjectRecords: true,
      showInSidebar: true,
    }),
    memberObjectPermission({
      objectUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.note.universalIdentifier,
      canUpdateObjectRecords: true,
      canSoftDeleteObjectRecords: true,
      showInSidebar: true,
    }),
    memberObjectPermission({
      objectUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.task.universalIdentifier,
      canUpdateObjectRecords: true,
      canSoftDeleteObjectRecords: true,
      showInSidebar: true,
    }),
    memberObjectPermission({
      objectUniversalIdentifier: FAMILY_MEMBER_OBJECT_UNIVERSAL_IDENTIFIER,
      canUpdateObjectRecords: true,
    }),
    memberObjectPermission({
      objectUniversalIdentifier: CALL_OBJECT_UNIVERSAL_IDENTIFIER,
    }),
    memberObjectPermission({
      objectUniversalIdentifier: AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
    }),
    memberObjectPermission({
      objectUniversalIdentifier: CARRIER_OBJECT_UNIVERSAL_IDENTIFIER,
    }),
    memberObjectPermission({
      objectUniversalIdentifier: PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
    }),
    memberObjectPermission({
      objectUniversalIdentifier: PRODUCT_TYPE_OBJECT_UNIVERSAL_IDENTIFIER,
    }),
    memberObjectPermission({
      objectUniversalIdentifier: CARRIER_PRODUCT_OBJECT_UNIVERSAL_IDENTIFIER,
    }),
    memberObjectPermission({
      objectUniversalIdentifier: LEAD_SOURCE_OBJECT_UNIVERSAL_IDENTIFIER,
    }),
  ],
  fieldPermissions: [
    restrictedField({
      objectUniversalIdentifier: AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
      fieldUniversalIdentifier: AGENT_EMAIL_FIELD_ID,
      canReadFieldValue: false,
      canUpdateFieldValue: false,
    }),
    restrictedField({
      objectUniversalIdentifier: AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
      fieldUniversalIdentifier: AGENT_NPN_FIELD_ID,
      canReadFieldValue: false,
      canUpdateFieldValue: false,
    }),
    restrictedField({
      objectUniversalIdentifier: AGENT_PROFILE_OBJECT_UNIVERSAL_IDENTIFIER,
      fieldUniversalIdentifier: AGENT_POLICIES_FIELD_ID,
      canUpdateFieldValue: false,
    }),
    restrictedField({
      objectUniversalIdentifier: CALL_OBJECT_UNIVERSAL_IDENTIFIER,
      fieldUniversalIdentifier: CALL_BILLABLE_FIELD_ID,
      canReadFieldValue: false,
      canUpdateFieldValue: false,
    }),
    restrictedField({
      objectUniversalIdentifier: CALL_OBJECT_UNIVERSAL_IDENTIFIER,
      fieldUniversalIdentifier: CALL_COST_FIELD_ID,
      canReadFieldValue: false,
      canUpdateFieldValue: false,
    }),
    restrictedField({
      objectUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.universalIdentifier,
      fieldUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.company.fields.people
          .universalIdentifier,
      canUpdateFieldValue: false,
    }),
    restrictedField({
      objectUniversalIdentifier: LEAD_SOURCE_OBJECT_UNIVERSAL_IDENTIFIER,
      fieldUniversalIdentifier: LEAD_SOURCE_LEADS_FIELD_ID,
      canUpdateFieldValue: false,
    }),
    restrictedField({
      objectUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
      fieldUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.fields.avatarUrl
          .universalIdentifier,
      canReadFieldValue: false,
      canUpdateFieldValue: false,
    }),
    restrictedField({
      objectUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
      fieldUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.fields.company
          .universalIdentifier,
      canUpdateFieldValue: false,
    }),
    restrictedField({
      objectUniversalIdentifier:
        STANDARD_OBJECT_UNIVERSAL_IDENTIFIERS.person.universalIdentifier,
      fieldUniversalIdentifier: LEAD_SOURCE_FIELD_ID,
      canUpdateFieldValue: false,
    }),
    restrictedField({
      objectUniversalIdentifier: POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
      fieldUniversalIdentifier: POLICY_AGENT_FIELD_ID,
      canUpdateFieldValue: false,
    }),
    restrictedField({
      objectUniversalIdentifier: POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
      fieldUniversalIdentifier: POLICY_LTV_FIELD_ID,
      canReadFieldValue: false,
      canUpdateFieldValue: false,
    }),
    restrictedField({
      objectUniversalIdentifier: POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
      fieldUniversalIdentifier: POLICY_PAID_THROUGH_DATE_FIELD_ID,
      canReadFieldValue: false,
      canUpdateFieldValue: false,
    }),
    restrictedField({
      objectUniversalIdentifier: POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
      fieldUniversalIdentifier: POLICY_STATUS_FIELD_ID,
      canUpdateFieldValue: false,
    }),
    restrictedField({
      objectUniversalIdentifier: POLICY_OBJECT_UNIVERSAL_IDENTIFIER,
      fieldUniversalIdentifier: POLICY_SUBMITTED_DATE_FIELD_ID,
      canUpdateFieldValue: false,
    }),
  ],
};

export default defineRole(agentRoleConfig);
