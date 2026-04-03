/**
 * Normalizes US state names to their 2-letter codes.
 * Handles full names ("Florida" → "FL"), already-coded ("FL" → "FL"),
 * and common variations (case-insensitive).
 */

const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC',
  'puerto rico': 'PR',
  'us virgin islands': 'VI',
  guam: 'GU',
  'american samoa': 'AS',
  'northern mariana islands': 'MP',
};

const VALID_CODES = new Set(Object.values(STATE_NAME_TO_CODE));

export function normalizeUsState(value: string | undefined | null): string {
  if (!value || typeof value !== 'string') return '';

  const trimmed = value.trim();

  if (!trimmed) return '';

  // Already a valid 2-letter code
  const upper = trimmed.toUpperCase();

  if (upper.length === 2 && VALID_CODES.has(upper)) {
    return upper;
  }

  // Try full name lookup
  const code = STATE_NAME_TO_CODE[trimmed.toLowerCase()];

  return code ?? trimmed;
}
