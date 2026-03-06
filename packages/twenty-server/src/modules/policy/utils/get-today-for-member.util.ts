// Returns the current UTC moment as an ISO string for stamping submittedDate.
// The frontend handles timezone display via formatInTimeZone().
export function getNowUtc(): string {
  return new Date().toISOString();
}
