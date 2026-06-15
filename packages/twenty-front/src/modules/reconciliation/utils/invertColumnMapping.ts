// ---------------------------------------------------------------------------
// Column-mapping inversion (crmField → BOB snapshot key)
//
// `reconciliation.columnMapping` maps raw BOB file headers → CRM field paths
// (captured by the import dialog). Components that read values back OFF a
// `bobRowSnapshot` need the inverse direction: "which snapshot key holds the
// value for this crmField?". This util is the single home for that inversion
// so UnmatchedView / buildSyntheticPolicyRecord (and future consumers) stop
// hardcoding Ambetter header literals (remediation 4.7).
// ---------------------------------------------------------------------------

/** Maps XLSX column header → CRM field info (import-dialog capture shape). */
export type ColumnMappingEntry = {
  /** CRM field path: 'policyNumber', 'lead.name.firstName', 'agent.npn' */
  crmField: string;
  /** FieldMetadataType: 'TEXT', 'DATE_TIME', 'FULL_NAME', etc. */
  fieldType: string;
  /** SpreadsheetImportField.key for pre-fill round-trip */
  fieldKey: string;
};

export type ColumnMapping = Record<string, ColumnMappingEntry>;

/** Computed-field definition stored on `carrierConfig.fieldConfig`. */
export type ComputedFieldDef = {
  /** Key the parse job adds to each row (e.g. 'True Effective Date') */
  outputKey: string;
  /** Computation method: 'maxDate', 'minDate', 'coalesce' */
  method?: string;
  /** Row keys used as inputs */
  inputs?: string[];
  /** Data type of the output */
  type?: string;
  /** CRM field this computed value maps to (for diffing) */
  crmField?: string | null;
};

export type CrmFieldSources = {
  /** Raw BOB header mapped to this crmField via columnMapping */
  mappedHeader?: string;
  /** FieldMetadataType of the mapped column */
  fieldType?: string;
  /** outputKey of a computed field (carrierConfig.fieldConfig) targeting this crmField */
  computedKey?: string;
};

export type CrmFieldLookup = Map<string, CrmFieldSources>;

/**
 * Invert a reconciliation's columnMapping into a crmField → snapshot-key
 * lookup, layering in computed-field output keys (which the diff engine
 * treats as authoritative for their crmField — see engines/diff.ts, where the
 * column-mapping loop skips crmFields covered by a computed field).
 *
 * First mapping wins on duplicate crmFields, matching the server's
 * `Object.entries(columnMapping).find(...)` resolution order.
 */
export const invertColumnMapping = (
  columnMapping: ColumnMapping | null | undefined,
  computedFields?: ComputedFieldDef[] | null,
): CrmFieldLookup => {
  const lookup: CrmFieldLookup = new Map();

  if (columnMapping) {
    for (const [header, entry] of Object.entries(columnMapping)) {
      if (!entry?.crmField) continue;
      if (lookup.has(entry.crmField)) continue;

      lookup.set(entry.crmField, {
        mappedHeader: header,
        fieldType: entry.fieldType,
      });
    }
  }

  if (computedFields) {
    for (const cf of computedFields) {
      if (!cf?.crmField || !cf.outputKey) continue;

      const existing = lookup.get(cf.crmField);

      if (existing?.computedKey !== undefined) continue;

      lookup.set(cf.crmField, { ...existing, computedKey: cf.outputKey });
    }
  }

  return lookup;
};

/**
 * Resolve the BOB snapshot value for a CRM field path.
 *
 * Resolution order:
 *  1. Computed-field output key, when the snapshot actually carries it —
 *     mirrors the diff engine, where a computed field covering a crmField
 *     supersedes the raw mapped column (e.g. 'True Effective Date' over the
 *     raw policy-effective-date column). Snapshots persisted before the
 *     computed field existed simply fall through.
 *  2. The mapped header from columnMapping. When a mapping entry exists it is
 *     authoritative for this carrier — we do NOT fall through to legacy
 *     literals on a null value, because a mapped-but-empty cell is real data.
 *  3. Legacy Ambetter literal header names, ONLY when the mapping has no
 *     entry for this crmField: snapshots from reconciliations created before
 *     the import dialog captured columnMapping (or with partial mappings) are
 *     keyed by Ambetter's raw headers, and showing those beats showing
 *     blanks. New carriers must rely on the mapping — their headers are not
 *     in any legacy list.
 */
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

    if (value !== undefined && value !== null) return value;
  }

  return null;
};
