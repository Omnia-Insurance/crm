import {
  QA_MANAGER_ASSIGNMENT_ORDER_FIELD_ID,
  QA_MANAGER_IS_ACTIVE_FIELD_ID,
  QA_MANAGER_LAST_ASSIGNED_AT_FIELD_ID,
  QA_MANAGER_NAME_FIELD_ID,
  QA_MANAGER_OBJECT_UNIVERSAL_IDENTIFIER,
  QA_MANAGER_WORKSPACE_MEMBER_FIELD_ID,
} from 'src/objects/qa-manager';
import { defineView } from 'twenty-sdk/define';

export const QA_MANAGER_VIEW_UNIVERSAL_IDENTIFIER =
  'f37fa715-54a5-42f5-9a09-d4e8635dce57';

export default defineView({
  universalIdentifier: QA_MANAGER_VIEW_UNIVERSAL_IDENTIFIER,
  name: 'Managers',
  objectUniversalIdentifier: QA_MANAGER_OBJECT_UNIVERSAL_IDENTIFIER,
  icon: 'IconUserCheck',
  position: 1,
  fields: [
    {
      universalIdentifier: 'e8de5e18-1e5e-40a3-8ada-8eab3a92ffa9',
      fieldMetadataUniversalIdentifier: QA_MANAGER_NAME_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 0,
    },
    {
      universalIdentifier: '1a51d822-b769-4e05-a487-ae615fa25476',
      fieldMetadataUniversalIdentifier: QA_MANAGER_WORKSPACE_MEMBER_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 1,
    },
    {
      universalIdentifier: '84bdc64b-02ad-4578-a6db-4af2ed11d741',
      fieldMetadataUniversalIdentifier: QA_MANAGER_IS_ACTIVE_FIELD_ID,
      isVisible: true,
      size: 8,
      position: 2,
    },
    {
      universalIdentifier: 'c42a7139-b468-48c2-99d0-58428add5685',
      fieldMetadataUniversalIdentifier: QA_MANAGER_ASSIGNMENT_ORDER_FIELD_ID,
      isVisible: true,
      size: 8,
      position: 3,
    },
    {
      universalIdentifier: '55dc987c-1252-4d56-9be9-258b3ba14cec',
      fieldMetadataUniversalIdentifier: QA_MANAGER_LAST_ASSIGNED_AT_FIELD_ID,
      isVisible: true,
      size: 12,
      position: 4,
    },
  ],
});
