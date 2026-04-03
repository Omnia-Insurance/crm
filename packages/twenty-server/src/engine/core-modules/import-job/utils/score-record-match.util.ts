/**
 * Generic record matching utility for re-import.
 * Ports the frontend scoreLeadMatch logic to the server.
 * Designed to work with any object type that has name, email, phone fields.
 */

export type RecordMatchData = {
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
};

export type RecordMatchResult = {
  score: number;
  candidateId: string;
  breakdown: Record<string, number>;
};

const normalizePhone = (phone: string): string =>
  phone.replace(/[^0-9]/g, '').replace(/^1(\d{10})$/, '$1');

const fuzzyNameMatch = (a: string, b: string): boolean => {
  const la = a.toLowerCase().trim();
  const lb = b.toLowerCase().trim();

  if (la === lb) return true;
  if (la.length >= 3 && lb.length >= 3 && la.slice(0, 3) === lb.slice(0, 3)) {
    return true;
  }

  return false;
};

/**
 * Extracts match-relevant fields from a DB record.
 * Handles both flat DB columns (nameFirstName) and composite objects.
 */
export function extractMatchDataFromRecord(
  record: Record<string, unknown>,
): RecordMatchData {
  // Handle FULL_NAME composite (may be object or flat columns)
  let firstName: string | undefined;
  let lastName: string | undefined;

  if (typeof record.name === 'object' && record.name !== null) {
    const nameObj = record.name as Record<string, unknown>;

    firstName = nameObj.firstName as string | undefined;
    lastName = nameObj.lastName as string | undefined;
  } else if (typeof record.name === 'string') {
    // Simple text name — split on space
    const parts = record.name.split(' ');

    firstName = parts[0];
    lastName = parts.slice(1).join(' ') || undefined;
  } else {
    firstName = record.nameFirstName as string | undefined;
    lastName = record.nameLastName as string | undefined;
  }

  // Handle PHONES composite
  let phone: string | undefined;

  if (typeof record.phones === 'object' && record.phones !== null) {
    phone = (record.phones as Record<string, unknown>)
      .primaryPhoneNumber as string | undefined;
  } else {
    phone = record.phonesPrimaryPhoneNumber as string | undefined;
  }

  // Handle EMAILS composite
  let email: string | undefined;

  if (typeof record.emails === 'object' && record.emails !== null) {
    email = (record.emails as Record<string, unknown>)
      .primaryEmail as string | undefined;
  } else {
    email = record.emailsPrimaryEmail as string | undefined;
  }

  // Handle ADDRESS composite
  let city: string | undefined;
  let state: string | undefined;

  if (
    typeof record.addressCustom === 'object' &&
    record.addressCustom !== null
  ) {
    const addr = record.addressCustom as Record<string, unknown>;

    city = addr.addressCity as string | undefined;
    state = addr.addressState as string | undefined;
  } else if (typeof record.address === 'object' && record.address !== null) {
    const addr = record.address as Record<string, unknown>;

    city = addr.addressCity as string | undefined;
    state = addr.addressState as string | undefined;
  } else {
    city =
      (record.addressCustomAddressCity as string) ??
      (record.addressCity as string | undefined);
    state =
      (record.addressCustomAddressState as string) ??
      (record.addressState as string | undefined);
  }

  return { firstName, lastName, email, phone, city, state };
}

/**
 * Score how well a candidate record matches the provided data.
 * Returns 0-100. Higher = better match.
 *
 * Scoring:
 *  - Email exact match: 50 pts
 *  - First name exact: 15 pts, fuzzy: 10 pts
 *  - Last name exact: 15 pts, fuzzy: 10 pts
 *  - Phone match (normalized): 20 pts
 *  - City match: 5 pts
 *  - State match: 5 pts
 */
export function scoreRecordMatch(
  candidate: RecordMatchData,
  target: RecordMatchData,
): RecordMatchResult & { candidateId: '' } {
  const breakdown: Record<string, number> = {};
  let score = 0;

  // Email — 50 points
  if (candidate.email && target.email) {
    if (candidate.email.toLowerCase() === target.email.toLowerCase()) {
      breakdown.email = 50;
      score += 50;
    }
  }

  // First Name — 15 exact, 10 fuzzy
  if (candidate.firstName && target.firstName) {
    if (
      candidate.firstName.toLowerCase() === target.firstName.toLowerCase()
    ) {
      breakdown.firstName = 15;
      score += 15;
    } else if (fuzzyNameMatch(candidate.firstName, target.firstName)) {
      breakdown.firstName = 10;
      score += 10;
    }
  }

  // Last Name — 15 exact, 10 fuzzy
  if (candidate.lastName && target.lastName) {
    if (candidate.lastName.toLowerCase() === target.lastName.toLowerCase()) {
      breakdown.lastName = 15;
      score += 15;
    } else if (fuzzyNameMatch(candidate.lastName, target.lastName)) {
      breakdown.lastName = 10;
      score += 10;
    }
  }

  // Phone — 20 points
  if (candidate.phone && target.phone) {
    if (normalizePhone(candidate.phone) === normalizePhone(target.phone)) {
      breakdown.phone = 20;
      score += 20;
    }
  }

  // City — 5 points
  if (candidate.city && target.city) {
    if (candidate.city.toLowerCase() === target.city.toLowerCase()) {
      breakdown.city = 5;
      score += 5;
    }
  }

  // State — 5 points
  if (candidate.state && target.state) {
    if (candidate.state.toLowerCase() === target.state.toLowerCase()) {
      breakdown.state = 5;
      score += 5;
    }
  }

  return { score, candidateId: '', breakdown };
}

/** Threshold for auto-matching (same person, high confidence) */
export const AUTO_MATCH_THRESHOLD = 80;

/** Threshold below which we consider it a different person */
export const DIFFERENT_PERSON_THRESHOLD = 55;

/**
 * Determine if two sets of match data describe the same person.
 * Uses the scoring system with thresholds.
 */
export function isSamePerson(
  existing: RecordMatchData,
  csvData: RecordMatchData,
): { same: boolean; score: number; breakdown: Record<string, number> } {
  const result = scoreRecordMatch(existing, csvData);

  return {
    same: result.score >= DIFFERENT_PERSON_THRESHOLD,
    score: result.score,
    breakdown: result.breakdown,
  };
}
