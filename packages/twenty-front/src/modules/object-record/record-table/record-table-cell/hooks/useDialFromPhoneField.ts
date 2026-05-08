import { FIND_MANY_FRONT_COMPONENTS } from '@/front-components/graphql/queries/findManyFrontComponents';
import { useOpenFrontComponentInSidePanel } from '@/side-panel/hooks/useOpenFrontComponentInSidePanel';
import { useApolloClient } from '@apollo/client/react';
import { useCallback, useMemo } from 'react';
import { IconPhone } from 'twenty-ui/display';

// OMNIA-CUSTOM: Click-to-call entry point for phone fields.
//
// Flow:
//   1. Write the dialed number to localStorage so the softphone can pick it
//      up on mount (handles the case where the panel was closed at click time).
//   2. Open the softphone front-component in the side panel via the
//      host-side opener — idempotent if already open with the same page.
//   3. Dispatch a `telephony:dial` window event for the case where the
//      softphone was already mounted; its hook listens directly.
//
// Coupling: this file knows the Telephony app's softphone universalIdentifier
// UUID and the localStorage key. Both are stable contract strings — the app
// can't be installed under a different UUID or its widget would not be
// reachable from cell actions. Documented in the Telephony app's README.

export const TELEPHONY_SOFTPHONE_UNIVERSAL_IDENTIFIER =
  '31069075-0ea1-4f05-a753-758f3eb2fd80';

export const TELEPHONY_PENDING_DIAL_STORAGE_KEY =
  '__omnia_telephony_pending_dial';

export const TELEPHONY_DIAL_EVENT_NAME = 'telephony:dial';

interface FrontComponentLite {
  id: string;
  universalIdentifier: string | null;
}

export const useDialFromPhoneField = () => {
  const apolloClient = useApolloClient();
  const { openFrontComponentInSidePanel } = useOpenFrontComponentInSidePanel();

  // Look up the softphone front-component from Apollo cache. `canDial` is
  // false when the Telephony app isn't installed in this workspace, which
  // lets callers (the detail-page PhonesFieldDisplay) fall through to the
  // default `tel:` open-link behavior instead of swallowing the click.
  const softphone = useMemo<FrontComponentLite | null>(() => {
    const cached = apolloClient.cache.readQuery<{
      frontComponents: FrontComponentLite[];
    }>({ query: FIND_MANY_FRONT_COMPONENTS });
    return (
      cached?.frontComponents.find(
        (component) =>
          component.universalIdentifier ===
          TELEPHONY_SOFTPHONE_UNIVERSAL_IDENTIFIER,
      ) ?? null
    );
  }, [apolloClient]);

  const canDial = softphone !== null;

  const dial = useCallback(
    (phoneNumber: string) => {
      if (!phoneNumber) return;

      try {
        window.localStorage.setItem(
          TELEPHONY_PENDING_DIAL_STORAGE_KEY,
          JSON.stringify({ phoneNumber, ts: Date.now() }),
        );
      } catch {
        // localStorage can throw in private browsing or when the quota is
        // exceeded. The direct event listener is still a path that works
        // when the softphone is already mounted, so we continue.
      }

      if (softphone) {
        openFrontComponentInSidePanel({
          frontComponentId: softphone.id,
          pageTitle: 'Softphone',
          pageIcon: IconPhone,
        });
      }

      window.dispatchEvent(
        new CustomEvent(TELEPHONY_DIAL_EVENT_NAME, {
          detail: { phoneNumber },
        }),
      );
    },
    [openFrontComponentInSidePanel, softphone],
  );

  return { dial, canDial };
};
