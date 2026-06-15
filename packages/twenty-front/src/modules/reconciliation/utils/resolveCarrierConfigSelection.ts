import {
  type CarrierConfig,
  type ColumnMapping,
} from '@/reconciliation/hooks/useOpenReconciliationImportDialog';

/**
 * A carrierConfig record prepared for the run wizard's carrier picker:
 * the pipeline config payload plus the linked carrier's display name.
 */
export type CarrierConfigPickerItem = {
  carrierConfig: CarrierConfig;
  carrierName: string | null;
};

/**
 * What the run wizard should do once carrierConfig records are loaded.
 *
 * - `none`     → no carrierConfig exists; show seeding guidance, never start
 *                a run (a run without a config breaks at PARSE).
 * - `single`   → exactly one config; open the import dialog directly so the
 *                single-carrier flow stays zero-friction (no extra click).
 * - `multiple` → show the carrier picker; `defaultCarrierConfigId` is the
 *                first item after a stable name sort, so the preselection is
 *                deterministic instead of whatever the API returned first.
 */
export type CarrierConfigSelection =
  | { kind: 'none' }
  | { kind: 'single'; item: CarrierConfigPickerItem }
  | {
      kind: 'multiple';
      items: CarrierConfigPickerItem[];
      defaultCarrierConfigId: string;
    };

/**
 * Map a raw carrierConfig record (from useFindManyRecords) to the picker
 * item shape consumed by the import dialog and the carrier picker modal.
 */
export const buildCarrierConfigPickerItem = (
  record: Record<string, unknown>,
): CarrierConfigPickerItem => {
  const carrier = record.carrier as { name?: string | null } | null | undefined;

  return {
    carrierConfig: {
      id: record.id as string,
      name: (record.name as string) ?? '',
      parserVersion: (record.parserVersion as string) ?? null,
      fieldConfig: (record.fieldConfig as unknown[]) ?? null,
      columnMapping: (record.columnMapping as ColumnMapping) ?? null,
      statusConfig: (record.statusConfig as Record<string, unknown>) ?? null,
    },
    carrierName: carrier?.name ?? null,
  };
};

export const resolveCarrierConfigSelection = (
  records: Record<string, unknown>[],
): CarrierConfigSelection => {
  if (records.length === 0) {
    return { kind: 'none' };
  }

  const items = records.map(buildCarrierConfigPickerItem);

  if (items.length === 1) {
    return { kind: 'single', item: items[0] };
  }

  const sortedItems = [...items].sort((a, b) =>
    a.carrierConfig.name.localeCompare(b.carrierConfig.name, undefined, {
      sensitivity: 'base',
    }),
  );

  return {
    kind: 'multiple',
    items: sortedItems,
    defaultCarrierConfigId: sortedItems[0].carrierConfig.id,
  };
};
