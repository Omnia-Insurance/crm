import { type ParsedRow } from 'src/utils/xlsx-parser';

type ColumnMapping = Record<string, string[]>;

export type NormalizedRow = {
  rowNumber: number;
  name: string;
  carrierPolicyNumber: string | null;
  subscriberNumber: string | null;
  memberFirstName: string | null;
  memberLastName: string | null;
  memberDob: string | null;
  brokerName: string | null;
  brokerEffectiveDate: string | null;
  policyEffectiveDate: string | null;
  trueEffectiveDate: string | null;
  paidThroughDate: string | null;
  termDate: string | null;
  eligibleForCommission: boolean | null;
  numberOfMembers: number | null;
  planName: string | null;
  monthlyPremium: number | null;
  memberResponsibility: number | null;
  memberPhone: string | null;
  memberEmail: string | null;
  exchangeSubscriberId: string | null;
  brokerNpn: string | null;
  payableAgent: string | null;
  onOffExchange: string | null;
  county: string | null;
  state: string | null;
  rawPayload: Record<string, unknown>;
};

// Resolve a column value by trying each alias against the actual headers
const resolveColumn = (
  row: ParsedRow,
  aliases: string[],
): unknown | undefined => {
  for (const alias of aliases) {
    if (alias in row) {
      return row[alias];
    }
  }

  return undefined;
};

const toString = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return String(value).trim();
};

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const str = String(value).replace(/[$,]/g, '').trim();
  const num = Number(str);

  return isNaN(num) ? null : num;
};

// Parse dates in various formats: MM/DD/YYYY, M/D/YYYY, YYYY-MM-DD, Excel serial
const toDateString = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  // Handle Date objects (from xlsx cellDates)
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }

  const str = String(value).trim();

  // YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // MM/DD/YYYY or M/D/YYYY
  const slashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    const m = month.padStart(2, '0');
    const d = day.padStart(2, '0');

    return `${year}-${m}-${d}`;
  }

  // Excel serial number
  const serial = Number(str);

  if (!isNaN(serial) && serial > 1 && serial < 100000) {
    const date = new Date((serial - 25569) * 86400 * 1000);

    return date.toISOString().split('T')[0];
  }

  return null;
};

const toBoolean = (value: unknown): boolean | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const str = String(value).trim().toLowerCase();

  if (str === 'yes' || str === 'true' || str === '1') {
    return true;
  }

  if (str === 'no' || str === 'false' || str === '0') {
    return false;
  }

  return null;
};

// Compute true effective date = MAX(brokerEffectiveDate, policyEffectiveDate)
const computeTrueEffectiveDate = (
  brokerDate: string | null,
  policyDate: string | null,
): string | null => {
  if (!brokerDate && !policyDate) {
    return null;
  }

  if (!brokerDate) {
    return policyDate;
  }

  if (!policyDate) {
    return brokerDate;
  }

  return brokerDate > policyDate ? brokerDate : policyDate;
};

export const parseAmbetterBob = (
  rows: ParsedRow[],
  columnMapping: ColumnMapping,
): { normalized: NormalizedRow[]; errors: { row: number; error: string }[] } => {
  const normalized: NormalizedRow[] = [];
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 1;

    try {
      const carrierPolicyNumber = toString(
        resolveColumn(row, columnMapping.carrierPolicyNumber ?? []),
      );
      const brokerEffectiveDate = toDateString(
        resolveColumn(row, columnMapping.brokerEffectiveDate ?? []),
      );
      const policyEffectiveDate = toDateString(
        resolveColumn(row, columnMapping.policyEffectiveDate ?? []),
      );
      const trueEffectiveDate = computeTrueEffectiveDate(
        brokerEffectiveDate,
        policyEffectiveDate,
      );

      const policyLabel = carrierPolicyNumber ?? 'unknown';

      normalized.push({
        rowNumber,
        name: `${policyLabel} - row ${rowNumber}`,
        carrierPolicyNumber,
        subscriberNumber: toString(
          resolveColumn(row, columnMapping.subscriberNumber ?? []),
        ),
        memberFirstName: toString(
          resolveColumn(row, columnMapping.memberFirstName ?? []),
        ),
        memberLastName: toString(
          resolveColumn(row, columnMapping.memberLastName ?? []),
        ),
        memberDob: toDateString(
          resolveColumn(row, columnMapping.memberDob ?? []),
        ),
        brokerName: toString(
          resolveColumn(row, columnMapping.brokerName ?? []),
        ),
        brokerEffectiveDate,
        policyEffectiveDate,
        trueEffectiveDate,
        paidThroughDate: toDateString(
          resolveColumn(row, columnMapping.paidThroughDate ?? []),
        ),
        termDate: toDateString(
          resolveColumn(row, columnMapping.policyTermDate ?? []),
        ),
        eligibleForCommission: toBoolean(
          resolveColumn(row, columnMapping.eligibleForCommission ?? []),
        ),
        numberOfMembers: toNumber(
          resolveColumn(row, columnMapping.numberOfMembers ?? []),
        ),
        planName: toString(
          resolveColumn(row, columnMapping.planName ?? []),
        ),
        monthlyPremium: toNumber(
          resolveColumn(row, columnMapping.monthlyPremium ?? []),
        ),
        memberResponsibility: toNumber(
          resolveColumn(row, columnMapping.memberResponsibility ?? []),
        ),
        memberPhone: toString(
          resolveColumn(row, columnMapping.memberPhone ?? []),
        ),
        memberEmail: toString(
          resolveColumn(row, columnMapping.memberEmail ?? []),
        ),
        exchangeSubscriberId: toString(
          resolveColumn(row, columnMapping.subscriberNumber ?? []),
        ),
        brokerNpn: toString(
          resolveColumn(row, columnMapping.brokerNpn ?? []),
        ),
        payableAgent: toString(
          resolveColumn(row, columnMapping.payableAgent ?? []),
        ),
        onOffExchange: toString(
          resolveColumn(row, columnMapping.onOffExchange ?? []),
        ),
        county: toString(resolveColumn(row, columnMapping.county ?? [])),
        state: toString(resolveColumn(row, columnMapping.state ?? [])),
        rawPayload: row as Record<string, unknown>,
      });
    } catch (error) {
      errors.push({
        row: rowNumber,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return { normalized, errors };
};
