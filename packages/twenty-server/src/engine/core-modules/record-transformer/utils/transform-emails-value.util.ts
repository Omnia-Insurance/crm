import { isNonEmptyArray, isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'class-validator';

export const transformEmailsValue = (
  // oxlint-disable-next-line typescript/no-explicit-any
  value: any,
  // oxlint-disable-next-line typescript/no-explicit-any
): any => {
  if (!isDefined(value)) {
    return value;
  }

  let additionalEmails: string | null = value?.additionalEmails;
  // OMNIA-CUSTOM: trim pasted/imported emails so lookups and dedup match
  const primaryEmail = isNonEmptyString(value?.primaryEmail)
    ? value.primaryEmail.trim().toLowerCase()
    : null;

  if (additionalEmails) {
    try {
      const emailArray = (
        isNonEmptyString(additionalEmails)
          ? JSON.parse(additionalEmails)
          : additionalEmails
      ) as string[];

      // OMNIA-CUSTOM: same trim for additional emails
      additionalEmails = isNonEmptyArray(emailArray)
        ? JSON.stringify(emailArray.map((email) => email.trim().toLowerCase()))
        : null;
    } catch {
      /* empty */
    }
  }

  return {
    primaryEmail,
    additionalEmails,
  };
};
