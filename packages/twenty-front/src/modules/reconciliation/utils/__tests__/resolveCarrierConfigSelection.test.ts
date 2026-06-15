import {
  buildCarrierConfigPickerItem,
  resolveCarrierConfigSelection,
} from '@/reconciliation/utils/resolveCarrierConfigSelection';

const AMBETTER_RECORD: Record<string, unknown> = {
  id: 'config-ambetter',
  name: 'Ambetter BOB',
  parserVersion: 'ambetter-bob-v1',
  fieldConfig: [{ outputKey: 'True Effective Date' }],
  columnMapping: {
    'Policy Number': {
      crmField: 'policyNumber',
      fieldType: 'TEXT',
      fieldKey: 'policyNumber',
    },
  },
  statusConfig: { engineId: 'ambetter-bob-v1' },
  carrier: { id: 'carrier-ambetter', name: 'Ambetter' },
};

const UHO_RECORD: Record<string, unknown> = {
  id: 'config-uho',
  name: 'UHO BOB',
  parserVersion: null,
  fieldConfig: null,
  columnMapping: null,
  statusConfig: null,
  carrier: { id: 'carrier-uho', name: 'United Health One' },
};

describe('buildCarrierConfigPickerItem', () => {
  it('maps a full record onto the CarrierConfig contract with carrier name', () => {
    const item = buildCarrierConfigPickerItem(AMBETTER_RECORD);

    expect(item.carrierConfig).toEqual({
      id: 'config-ambetter',
      name: 'Ambetter BOB',
      parserVersion: 'ambetter-bob-v1',
      fieldConfig: [{ outputKey: 'True Effective Date' }],
      columnMapping: {
        'Policy Number': {
          crmField: 'policyNumber',
          fieldType: 'TEXT',
          fieldKey: 'policyNumber',
        },
      },
      statusConfig: { engineId: 'ambetter-bob-v1' },
    });
    expect(item.carrierName).toBe('Ambetter');
  });

  it('defaults missing optional fields to null and missing carrier relation to null', () => {
    const item = buildCarrierConfigPickerItem({
      id: 'config-bare',
      name: 'Bare Config',
    });

    expect(item.carrierConfig).toEqual({
      id: 'config-bare',
      name: 'Bare Config',
      parserVersion: null,
      fieldConfig: null,
      columnMapping: null,
      statusConfig: null,
    });
    expect(item.carrierName).toBeNull();
  });

  it('defaults a missing name to an empty string', () => {
    const item = buildCarrierConfigPickerItem({ id: 'config-unnamed' });

    expect(item.carrierConfig.name).toBe('');
  });
});

describe('resolveCarrierConfigSelection', () => {
  it('returns none when no carrierConfig records exist', () => {
    expect(resolveCarrierConfigSelection([])).toEqual({ kind: 'none' });
  });

  it('returns single with the only record so single-carrier flows skip the picker', () => {
    const selection = resolveCarrierConfigSelection([AMBETTER_RECORD]);

    expect(selection.kind).toBe('single');

    if (selection.kind !== 'single') {
      throw new Error('expected single selection');
    }

    expect(selection.item.carrierConfig.id).toBe('config-ambetter');
    expect(selection.item.carrierName).toBe('Ambetter');
  });

  it('returns multiple with items sorted by config name regardless of API order', () => {
    const selection = resolveCarrierConfigSelection([
      UHO_RECORD,
      AMBETTER_RECORD,
    ]);

    expect(selection.kind).toBe('multiple');

    if (selection.kind !== 'multiple') {
      throw new Error('expected multiple selection');
    }

    expect(selection.items.map((item) => item.carrierConfig.id)).toEqual([
      'config-ambetter',
      'config-uho',
    ]);
  });

  it('defaults the picker preselection to the first name-sorted config, not records[0]', () => {
    const selection = resolveCarrierConfigSelection([
      UHO_RECORD,
      AMBETTER_RECORD,
    ]);

    if (selection.kind !== 'multiple') {
      throw new Error('expected multiple selection');
    }

    expect(selection.defaultCarrierConfigId).toBe('config-ambetter');
  });

  it('sorts case-insensitively', () => {
    const selection = resolveCarrierConfigSelection([
      { ...UHO_RECORD, id: 'config-b', name: 'bcbs bob' },
      { ...AMBETTER_RECORD, id: 'config-a', name: 'Ambetter BOB' },
      { ...UHO_RECORD, id: 'config-c', name: 'BCBS Texas' },
    ]);

    if (selection.kind !== 'multiple') {
      throw new Error('expected multiple selection');
    }

    expect(selection.items.map((item) => item.carrierConfig.name)).toEqual([
      'Ambetter BOB',
      'bcbs bob',
      'BCBS Texas',
    ]);
  });

  it('does not mutate the input record order', () => {
    const records = [UHO_RECORD, AMBETTER_RECORD];

    resolveCarrierConfigSelection(records);

    expect(records[0]).toBe(UHO_RECORD);
  });
});
