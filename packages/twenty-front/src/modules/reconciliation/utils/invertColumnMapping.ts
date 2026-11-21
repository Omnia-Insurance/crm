// reconciliation.columnMapping maps BOB file headers to CRM field paths. Readers of a
// bobRowSnapshot need the inverse, and this is its single home so no consumer hardcodes
// Ambetter header literals (remediation 4.7).

// Keyed by the XLSX column header, as the import dialog captures it
export type ColumnMappingEntry = {
  // e.g. 'policyNumber', 'lead.name.firstName', 'agent.npn'
  crmField: string;
  fieldType: string;
  // SpreadsheetImportField.key, for the pre-fill round trip
  fieldKey: string;
};

export type ColumnMapping = Record<string, ColumnMappingEntry>;

// An entry of carrierConfig.fieldConfig
export type ComputedFieldDef = {
  // Key the parse job adds to each row, e.g. 'True Effective Date'
  outputKey: string;
  // 'maxDate', 'minDate' or 'coalesce'
  method?: string;
  inputs?: string[];
  type?: string;
  crmField?: string | null;
};

export type CrmFieldSources = {
  mappedHeader?: string;
  fieldType?: string;
  // outputKey of a computed field that targets this crmField
  computedKey?: string;
};

export type CrmFieldLookup = Map<string, CrmFieldSources>;

// Computed output keys are layered in because the server diff engine treats them as
// authoritative for their crmField (engines/diff.ts). On duplicate crmFields the first
// mapping wins, like the server's Object.entries(columnMapping).find(...).
export const invertColumnMapping = (
  columnMapping: ColumnMapping | null | undefined,
  computedFields?: ComputedFieldDef[] | null,
): CrmFieldLookup => {
  const lookup: CrmFieldLookup = new Map();

  if (columnMapping) {
    for (const [header, entry] of Object.entries(columnMapping)) {
      if (!entry?.crmField) {
        continue;
      }
      if (lookup.has(entry.crmField)) {
        continue;
      }

      lookup.set(entry.crmField, {
        mappedHeader: header,
        fieldType: entry.fieldType,
      });
    }
  }

  if (computedFields) {
    for (const cf of computedFields) {
      if (!cf?.crmField || !cf.outputKey) {
        continue;
      }

      const existing = lookup.get(cf.crmField);

      if (existing?.computedKey !== undefined) {
        continue;
      }

      lookup.set(cf.crmField, { ...existing, computedKey: cf.outputKey });
    }
  }

  return lookup;
};

// Order, as in the server diff engine: a computed output key the snapshot carries, then the
// mapped header, which stays authoritative when its cell is empty. Legacy Ambetter literals
// apply only when the mapping has no entry: snapshots from before the import dialog captured
// columnMapping are keyed by Ambetter's raw headers. New carriers rely on the mapping alone.
export const resolveBobValue = (
  snapshot: Record<string, unknown>,
  lookup: CrmFieldLookup,
  crmField: string,
  legacyKeys: readonly string[] = [],
): unknown => {
  const sources = lookup.get(crmField);

  if (sources?.computedKey !== undefined && sources.computedKey in snapshot) {
    return snapshot[sources.computedKey] ?? null;
  }

  if (sources?.mappedHeader !== undefined) {
    return snapshot[sources.mappedHeader] ?? null;
  }

  for (const key of legacyKeys) {
    const value = snapshot[key];

    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return null;
};
