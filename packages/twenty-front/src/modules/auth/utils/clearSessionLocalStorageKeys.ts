import { safeRemoveLocalStorageItems } from '@/auth/utils/safeRemoveLocalStorageItems';

const SESSION_KEYS_TO_CLEAR = [
  // Clear values persisted before this now-unused state was removed.
  'lastVisitedObjectMetadataItemIdState',
  'lastVisitedViewPerObjectMetadataItemState',
  'ai/agentChatDraftsByThreadIdState',
  'companyEnrichmentState',
  'personEnrichmentState',
  'currentUserWorkspaceState:v2',
  'locale',
  'currentUserState',
  'currentWorkspaceState',
  'currentWorkspaceMemberState',
  'currentUserWorkspaceState',
  // OMNIA-CUSTOM: the next user on a shared machine must not re-attach to
  // another user's import progress and row errors (CSV PHI).
  'activeImportJobId',
];

export const clearSessionLocalStorageKeys = () => {
  safeRemoveLocalStorageItems(SESSION_KEYS_TO_CLEAR);
};
