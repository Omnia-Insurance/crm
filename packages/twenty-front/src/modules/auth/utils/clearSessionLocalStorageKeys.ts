import { safeRemoveLocalStorageItems } from '@/auth/utils/safeRemoveLocalStorageItems';

const SESSION_KEYS_TO_CLEAR = [
  'lastVisitedObjectMetadataItemIdState',
  'lastVisitedViewPerObjectMetadataItemState',
  'ai/agentChatDraftsByThreadIdState',
  'locale',
  'currentUserState',
  'currentWorkspaceState',
  'currentWorkspaceMemberState',
  'currentUserWorkspaceState',
  // OMNIA-CUSTOM: server-side export tracking — never let the next user on a
  // shared machine re-attach to (and auto-download) someone else's export.
  'activeExportJobId',
];

export const clearSessionLocalStorageKeys = () => {
  safeRemoveLocalStorageItems(SESSION_KEYS_TO_CLEAR);
};
