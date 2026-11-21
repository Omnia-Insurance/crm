import { type EmailsMetadata } from '@/types/composite-types/emails.composite-type';
import {
  type AdditionalPhoneMetadata,
  type PhonesMetadata,
} from '@/types/composite-types/phones.composite-type';

// A carrier's book of business often disagrees with our primary phone; the old
// primary moves to additionalPhones instead of being overwritten. The new
// primary never also appears in additionalPhones.
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

// Same rules as promotePrimaryPhoneToAdditional, for Emails composites.
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
