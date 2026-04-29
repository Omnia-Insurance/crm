import {
  type AdditionalPhoneMetadata,
  type PhonesMetadata,
} from '../../types/composite-types/phones.composite-type';
import { type EmailsMetadata } from '../../types/composite-types/emails.composite-type';

/**
 * Replace a Phones composite's primary number with `newPrimaryNumber`, pushing
 * the previous primary into `additionalPhones` so it isn't lost.
 *
 * Invariants:
 * - If the existing primary is empty/null → just set the new primary, no push.
 * - If the existing primary equals the new primary → no-op (return as-is).
 * - Otherwise push the previous primary into `additionalPhones`, deduped by `number`.
 * - The new primary is never simultaneously present in `additionalPhones`
 *   (any existing entry whose `number` matches the new primary is removed).
 *
 * Why: when reconciling a Book-of-Business against the CRM, the carrier-supplied
 * primary often differs from what we have. Overwriting silently loses contact
 * info. This keeps both numbers reachable.
 */
export const promotePrimaryPhoneToAdditional = (
  existing: PhonesMetadata | null | undefined,
  newPrimaryNumber: string,
  newPrimaryCountryCode?: string,
  newPrimaryCallingCode?: string,
): PhonesMetadata => {
  const existingPrimary = existing?.primaryPhoneNumber ?? '';
  const existingCountryCode = existing?.primaryPhoneCountryCode ?? '';
  const existingCallingCode = existing?.primaryPhoneCallingCode ?? '';
  const existingAdditional: AdditionalPhoneMetadata[] =
    existing?.additionalPhones ?? [];

  // No-op: nothing to change.
  if (existingPrimary === newPrimaryNumber) {
    return {
      primaryPhoneNumber: existingPrimary,
      primaryPhoneCountryCode:
        existingCountryCode as PhonesMetadata['primaryPhoneCountryCode'],
      primaryPhoneCallingCode: existingCallingCode,
      additionalPhones:
        existingAdditional.length > 0 ? existingAdditional : null,
    };
  }

  // Build the next additional list:
  //   1. Start from existing additionals.
  //   2. If the OLD primary was non-empty AND not already in the list,
  //      append it as a new additional entry.
  //   3. Drop any entry whose number matches the NEW primary (avoids dupes
  //      when the new primary was previously demoted to additional).
  const next: AdditionalPhoneMetadata[] = [...existingAdditional];

  if (
    existingPrimary !== '' &&
    !next.some((p) => p.number === existingPrimary)
  ) {
    next.push({
      number: existingPrimary,
      // libphonenumber-js's CountryCode is a string-literal union; the
      // workspace ORM stores arbitrary strings here. Keep what's there.
      countryCode:
        existingCountryCode as AdditionalPhoneMetadata['countryCode'],
      callingCode: existingCallingCode,
    });
  }

  const deduped = next.filter((p) => p.number !== newPrimaryNumber);

  return {
    primaryPhoneNumber: newPrimaryNumber,
    primaryPhoneCountryCode: (newPrimaryCountryCode ??
      existingCountryCode) as PhonesMetadata['primaryPhoneCountryCode'],
    primaryPhoneCallingCode: newPrimaryCallingCode ?? existingCallingCode,
    additionalPhones: deduped.length > 0 ? deduped : null,
  };
};

/**
 * Email-flavored version of `promotePrimaryPhoneToAdditional`. Same invariants;
 * `additionalEmails` is `string[]` so dedupe is a direct equality check.
 */
export const promotePrimaryEmailToAdditional = (
  existing: EmailsMetadata | null | undefined,
  newPrimaryEmail: string,
): EmailsMetadata => {
  const existingPrimary = existing?.primaryEmail ?? '';
  const existingAdditional: string[] = existing?.additionalEmails ?? [];

  if (existingPrimary === newPrimaryEmail) {
    return {
      primaryEmail: existingPrimary,
      additionalEmails:
        existingAdditional.length > 0 ? existingAdditional : null,
    };
  }

  const next: string[] = [...existingAdditional];

  if (existingPrimary !== '' && !next.includes(existingPrimary)) {
    next.push(existingPrimary);
  }

  const deduped = next.filter((e) => e !== newPrimaryEmail);

  return {
    primaryEmail: newPrimaryEmail,
    additionalEmails: deduped.length > 0 ? deduped : null,
  };
};
