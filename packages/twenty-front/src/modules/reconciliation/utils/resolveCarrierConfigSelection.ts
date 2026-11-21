import {
  type CarrierConfig,
  type ColumnMapping,
} from '@/reconciliation/hooks/useOpenReconciliationImportDialog';

export type CarrierConfigPickerItem = {
  carrierConfig: CarrierConfig;
  carrierName: string | null;
};

// 'none' must never start a run (it would break at PARSE); 'single' skips the
// picker; 'multiple' preselects the first config by name, not by API order.
export type CarrierConfigSelection =
  | { kind: 'none' }
  | { kind: 'single'; item: CarrierConfigPickerItem }
  | {
      kind: 'multiple';
      items: CarrierConfigPickerItem[];
      defaultCarrierConfigId: string;
    };

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

  const sortedItems = [...items].sort((firstItem, secondItem) =>
    firstItem.carrierConfig.name.localeCompare(
      secondItem.carrierConfig.name,
      undefined,
      {
        sensitivity: 'base',
      },
    ),
  );

  return {
    kind: 'multiple',
    items: sortedItems,
    defaultCarrierConfigId: sortedItems[0].carrierConfig.id,
  };
};
