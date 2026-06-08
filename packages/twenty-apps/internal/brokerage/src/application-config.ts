import { defineApplication } from 'twenty-sdk/define';

import { BROKERAGE_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER } from 'src/constants/universal-identifiers';

const BROKERAGE_ABOUT_DESCRIPTION = [
  'Run a Twenty workspace as an insurance brokerage.',
  '',
  '#### What this app provides',
  '',
  'Brokerage installs the core CRM data model an insurance brokerage needs before provider integrations or automation are added.',
  '',
  'It includes native CRM objects and relationships for:',
  '- Agents and workspace-member assignment',
  '- Leads, family members, and lead sources',
  '- Policies tied to leads, agents, carriers, and products',
  '- Calls tied to leads, agents, lead sources, and recordings',
  '- Carriers, products, product types, and carrier products',
  '- Lead creation requirements and Assigned status automation',
  '',
  '#### What belongs elsewhere',
  '',
  'Brokerage intentionally does not include provider ingestion, compliance QA, payment reconciliation, or time tracking. Those should be installed as separate apps that depend on this core model.',
  '',
  '#### Roles',
  '',
  'The app defines Agent and Manager role templates. Post-install setup applies Agent policy-write ownership with write-scoped RLS until Twenty app manifests support scoped predicates directly.',
].join('\n');

export default defineApplication({
  universalIdentifier: 'ddc5e4cf-d4d7-4fa6-ae1d-d86e878661c9',
  displayName: 'Brokerage',
  description: 'Core insurance brokerage CRM model for Twenty workspaces.',
  aboutDescription: BROKERAGE_ABOUT_DESCRIPTION,
  defaultRoleUniversalIdentifier: BROKERAGE_DEFAULT_ROLE_UNIVERSAL_IDENTIFIER,
});
