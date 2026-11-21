// Stored in UTC; the front renders submittedDate in the member's time zone
export const getNowUtc = (): string => new Date().toISOString();
