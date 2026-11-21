import { isNonEmptyString } from '@sniptt/guards';

const US_STATE_CODE_BY_LOWERCASE_NAME: Record<string, string> = {
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

const US_STATE_CODES = new Set(Object.values(US_STATE_CODE_BY_LOWERCASE_NAME));

// Unrecognized values come back trimmed but otherwise as typed, so import and
// export never drop what the user entered.
export const normalizeUsState = (value: unknown): string => {
  if (!isNonEmptyString(value)) {
    return '';
  }

  const trimmedValue = value.trim();
  const upperCaseValue = trimmedValue.toUpperCase();

  if (US_STATE_CODES.has(upperCaseValue)) {
    return upperCaseValue;
  }

  return (
    US_STATE_CODE_BY_LOWERCASE_NAME[trimmedValue.toLowerCase()] ?? trimmedValue
  );
};
