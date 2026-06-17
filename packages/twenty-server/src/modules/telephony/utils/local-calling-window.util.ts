const DEFAULT_START_LOCAL_TIME = '09:00';
const DEFAULT_END_LOCAL_TIME = '20:00';
const DEFAULT_TIME_ZONE = 'America/New_York';

const STATE_TO_TIME_ZONE: Record<string, string> = {
  AL: 'America/Chicago',
  AK: 'America/Anchorage',
  AZ: 'America/Phoenix',
  AR: 'America/Chicago',
  CA: 'America/Los_Angeles',
  CO: 'America/Denver',
  CT: 'America/New_York',
  DE: 'America/New_York',
  FL: 'America/New_York',
  GA: 'America/New_York',
  HI: 'Pacific/Honolulu',
  IA: 'America/Chicago',
  ID: 'America/Denver',
  IL: 'America/Chicago',
  IN: 'America/Indiana/Indianapolis',
  KS: 'America/Chicago',
  KY: 'America/New_York',
  LA: 'America/Chicago',
  MA: 'America/New_York',
  MD: 'America/New_York',
  ME: 'America/New_York',
  MI: 'America/Detroit',
  MN: 'America/Chicago',
  MO: 'America/Chicago',
  MS: 'America/Chicago',
  MT: 'America/Denver',
  NC: 'America/New_York',
  ND: 'America/Chicago',
  NE: 'America/Chicago',
  NH: 'America/New_York',
  NJ: 'America/New_York',
  NM: 'America/Denver',
  NV: 'America/Los_Angeles',
  NY: 'America/New_York',
  OH: 'America/New_York',
  OK: 'America/Chicago',
  OR: 'America/Los_Angeles',
  PA: 'America/New_York',
  RI: 'America/New_York',
  SC: 'America/New_York',
  SD: 'America/Chicago',
  TN: 'America/Chicago',
  TX: 'America/Chicago',
  UT: 'America/Denver',
  VA: 'America/New_York',
  VT: 'America/New_York',
  WA: 'America/Los_Angeles',
  WI: 'America/Chicago',
  WV: 'America/New_York',
  WY: 'America/Denver',
};

type AddressLike = {
  addressState?: string | null;
  state?: string | null;
  timeZone?: string | null;
};

type CallingWindowLead = {
  timeZone?: string | null;
  addressCustom?: AddressLike | null;
};

type CallingWindowCampaign = {
  allowedStartLocalTime?: string | null;
  allowedEndLocalTime?: string | null;
  defaultTimeZone?: string | null;
};

const parseDecimalDigits = (value: string): number | null => {
  if (value.length === 0) {
    return null;
  }

  let result = 0;

  for (const character of value) {
    const characterCode = character.charCodeAt(0);

    if (characterCode < 48 || characterCode > 57) {
      return null;
    }

    result = result * 10 + characterCode - 48;
  }

  return result;
};

const parseStrictLocalTimeToMinutes = (value: string): number | null => {
  const segments = value.split(':');

  if (segments.length !== 2) {
    return null;
  }

  const [hoursValue, minutesValue] = segments;
  const hours = parseDecimalDigits(hoursValue ?? '');
  const minutes = parseDecimalDigits(minutesValue ?? '');

  if (
    hours === null ||
    minutes === null ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
};

const parseLocalTimeToMinutes = (
  value: string | null | undefined,
  fallback: string,
): number => {
  const minutes = parseStrictLocalTimeToMinutes(value ?? fallback);

  if (minutes !== null) {
    return minutes;
  }

  const fallbackMinutes = parseStrictLocalTimeToMinutes(fallback);

  if (fallbackMinutes === null) {
    throw new Error(`Invalid fallback local time: ${fallback}`);
  }

  return fallbackMinutes;
};

const getLocalMinutes = (timeZone: string, now: Date): number => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(now);
  const hoursValue = parts.find((part) => part.type === 'hour')?.value ?? '';
  const minutesValue = parts.find((part) => part.type === 'minute')?.value ?? '';
  const hours = parseDecimalDigits(hoursValue);
  const minutes = parseDecimalDigits(minutesValue);

  if (hours === null || minutes === null) {
    throw new Error(`Unable to resolve local time for ${timeZone}`);
  }

  return hours * 60 + minutes;
};

const isInRange = (
  currentMinutes: number,
  startMinutes: number,
  endMinutes: number,
): boolean => {
  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
};

const getAddressState = (
  lead: CallingWindowLead | null | undefined,
): string | null => {
  const rawState =
    lead?.addressCustom?.addressState ?? lead?.addressCustom?.state;

  return rawState?.trim().toUpperCase() ?? null;
};

export const resolveLeadTimeZone = ({
  lead,
  campaign,
}: {
  lead: CallingWindowLead | null | undefined;
  campaign: CallingWindowCampaign | null | undefined;
}): string => {
  const leadTimeZone = lead?.timeZone ?? lead?.addressCustom?.timeZone ?? null;

  if (leadTimeZone) {
    return leadTimeZone;
  }

  const stateTimeZone = STATE_TO_TIME_ZONE[getAddressState(lead) ?? ''];

  return (
    stateTimeZone ??
    (campaign?.defaultTimeZone || DEFAULT_TIME_ZONE)
  );
};

export const isWithinAllowedCallingWindow = ({
  lead,
  campaign,
  now = new Date(),
}: {
  lead?: CallingWindowLead | null;
  campaign?: CallingWindowCampaign | null;
  now?: Date;
}): {
  allowed: boolean;
  timeZone: string;
  localMinutes: number;
  startMinutes: number;
  endMinutes: number;
} => {
  const timeZone = resolveLeadTimeZone({ lead, campaign });
  const startMinutes = parseLocalTimeToMinutes(
    campaign?.allowedStartLocalTime,
    DEFAULT_START_LOCAL_TIME,
  );
  const endMinutes = parseLocalTimeToMinutes(
    campaign?.allowedEndLocalTime,
    DEFAULT_END_LOCAL_TIME,
  );
  const localMinutes = getLocalMinutes(timeZone, now);

  return {
    allowed: isInRange(localMinutes, startMinutes, endMinutes),
    timeZone,
    localMinutes,
    startMinutes,
    endMinutes,
  };
};
