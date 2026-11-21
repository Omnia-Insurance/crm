import { timingSafeEqual } from 'crypto';

import { isNonEmptyString } from '@sniptt/guards';

// A pipeline without a secret accepts no push: the endpoint is public.
export const isValidIngestionWebhookSecret = ({
  providedSecret,
  expectedSecret,
}: {
  providedSecret: unknown;
  expectedSecret: string | null;
}): boolean => {
  if (!isNonEmptyString(providedSecret) || !isNonEmptyString(expectedSecret)) {
    return false;
  }

  const providedSecretBuffer = Buffer.from(providedSecret);
  const expectedSecretBuffer = Buffer.from(expectedSecret);

  return (
    providedSecretBuffer.length === expectedSecretBuffer.length &&
    timingSafeEqual(providedSecretBuffer, expectedSecretBuffer)
  );
};
