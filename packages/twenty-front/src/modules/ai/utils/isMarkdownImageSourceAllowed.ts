import { isNonEmptyString } from '@sniptt/guards';

import { REACT_APP_SERVER_BASE_URL } from '~/config';

// An image loads with no click, so a URL planted in data the model reads could carry PHI to any host:
// only the app's own origin and the server's (signed file URLs) may load.
export const isMarkdownImageSourceAllowed = (
  source: string | undefined,
): boolean => {
  if (!isNonEmptyString(source)) {
    return false;
  }

  try {
    const { origin } = new URL(source, window.location.origin);

    return (
      origin === window.location.origin ||
      origin === new URL(REACT_APP_SERVER_BASE_URL).origin
    );
  } catch {
    return false;
  }
};
