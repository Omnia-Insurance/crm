import { defineApplication } from 'twenty-sdk';

import {
  APP_UNIVERSAL_IDENTIFIER,
  DEFAULT_ROLE_UNIVERSAL_ID,
} from 'src/constants/universal-identifiers';

export default defineApplication({
  universalIdentifier: APP_UNIVERSAL_IDENTIFIER,
  displayName: 'Payment Reconciliation',
  description:
    'Carrier BOB ingestion, normalization, matching, and payment reconciliation for insurance policies',
  defaultRoleUniversalIdentifier: DEFAULT_ROLE_UNIVERSAL_ID,
});
