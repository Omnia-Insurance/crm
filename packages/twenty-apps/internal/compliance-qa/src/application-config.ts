import { DEFAULT_ROLE_UNIVERSAL_IDENTIFIER } from 'src/roles/default-role';
import { defineApplication } from 'twenty-sdk';

export default defineApplication({
  universalIdentifier: 'e8b3a1c5-6d47-4f29-9e8a-3c5b7d1f4e06',
  displayName: 'Compliance QA',
  description:
    'Automated compliance monitoring and QA scoring for insurance sales calls',
  defaultRoleUniversalIdentifier: DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
});
