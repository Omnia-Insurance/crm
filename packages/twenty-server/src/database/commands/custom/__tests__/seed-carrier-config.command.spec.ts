// OMNIA-CUSTOM: tests for the generic carrier-config seed command
// (multi-carrier readiness audit 2026-06-11 §"Generic seed-carrier-config
// command with pre-flight validation"). Covers the pre-flight refusal cases
// (unknown engine, missing explicit startDate, bad regex), --validate-only
// never writing, the create + merge write paths against stubbed repos, and
// bit-for-bit parity with the Ambetter seed's exported merge helpers.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { buildCarrierConfigUpdate } from 'src/database/commands/custom/seed-ambetter-carrier-config.command';
import {
  assembleCarrierConfigRecord,
  buildGenericCarrierConfigUpdate,
  type CarrierConfigDefinition,
  preflightCarrierConfigPayload,
  SeedCarrierConfigCommand,
  validateCarrierConfigDefinition,
} from 'src/database/commands/custom/seed-carrier-config.command';
import { DEFAULT_MATCHING_CONFIG } from 'src/modules/reconciliation/engines/matching';
import { STATUS_ENGINE_IDS } from 'src/modules/reconciliation/engines/status';
import { parseCarrierPipelineConfig } from 'src/modules/reconciliation/types/carrier-config';
import { type CarrierConfigRecord } from 'src/modules/reconciliation/types/reconciliation';

const WORKSPACE_ID = 'workspace-id';
const CARRIER_ID = 'carrier-uho-id';

const FIXTURE_PATH = path.join(
  __dirname,
  'fixtures',
  'uho-carrier-config.json',
);

const loadFixture = (): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8'));

const createDefinition = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  name: 'UHO',
  carrierName: 'UHO',
  statusConfig: {
    engineId: 'ambetter-bob-v1',
    fieldMapping: {
      effectiveDate: 'Effective Date',
      paidThroughDate: 'Paid To Date',
    },
  },
  matchingConfig: { startDate: null },
  ...overrides,
});

const asDefinition = (raw: Record<string, unknown>): CarrierConfigDefinition =>
  raw as unknown as CarrierConfigDefinition;

const writeDefinitionFile = (definition: unknown): string => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'seed-carrier-config-spec-'),
  );
  const file = path.join(dir, 'definition.json');

  fs.writeFileSync(file, JSON.stringify(definition));

  return file;
};

// ---------------------------------------------------------------------------
// Command harness (stubbed repos, same style as the sibling command specs)
// ---------------------------------------------------------------------------

const createCommand = ({
  existingConfig = null,
  carrier = { id: CARRIER_ID, name: 'UHO' },
}: {
  existingConfig?: Record<string, unknown> | null;
  carrier?: Record<string, unknown> | null;
} = {}) => {
  const carrierConfigRepo = {
    findOne: jest.fn(async () => existingConfig),
    save: jest.fn(async (record: unknown) => record),
    update: jest.fn(async () => undefined),
  };
  const carrierRepo = {
    findOne: jest.fn(async () => carrier),
  };
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(
      async (callback: () => Promise<unknown>) => callback(),
    ),
    getRepository: jest.fn(async (_workspaceId: string, objectName: string) =>
      objectName === 'carrierConfig' ? carrierConfigRepo : carrierRepo,
    ),
  };
  const command = new SeedCarrierConfigCommand(
    {} as never,
    globalWorkspaceOrmManager as never,
  );
  const errorSpy = jest
    .spyOn((command as any).logger, 'error')
    .mockImplementation(() => undefined);
  const warnSpy = jest
    .spyOn((command as any).logger, 'warn')
    .mockImplementation(() => undefined);
  const logSpy = jest
    .spyOn((command as any).logger, 'log')
    .mockImplementation(() => undefined);

  return {
    command,
    carrierConfigRepo,
    carrierRepo,
    errorSpy,
    warnSpy,
    logSpy,
  };
};

const runOnWorkspace = (
  command: SeedCarrierConfigCommand,
  options: Record<string, unknown> = {},
) =>
  command.runOnWorkspace({
    workspaceId: WORKSPACE_ID,
    options,
    index: 0,
    total: 1,
  });

// ---------------------------------------------------------------------------
// Structural validation (definition-file shape)
// ---------------------------------------------------------------------------

describe('validateCarrierConfigDefinition', () => {
  it('accepts the UHO fixture with no problems and no warnings', () => {
    const { definition, problems, warnings } =
      validateCarrierConfigDefinition(loadFixture());

    expect(problems).toEqual([]);
    expect(warnings).toEqual([]);
    expect(definition?.name).toBe('UHO');
  });

  it('refuses a definition whose matchingConfig omits the startDate key (the silent-Ambetter-default trap)', () => {
    const { definition, problems } = validateCarrierConfigDefinition(
      createDefinition({ matchingConfig: { autoMatchThreshold: 90 } }),
    );

    expect(definition).toBeNull();
    expect(problems.join(' ')).toContain('matchingConfig.startDate');
    expect(problems.join(' ')).toContain('2025-07-09');
  });

  it('accepts an explicit startDate: null (no cutoff)', () => {
    const { problems } = validateCarrierConfigDefinition(
      createDefinition({ matchingConfig: { startDate: null } }),
    );

    expect(problems).toEqual([]);
  });

  it('refuses a definition without an explicit statusConfig.engineId (the silent-fallback trap)', () => {
    const { definition, problems } = validateCarrierConfigDefinition(
      createDefinition({
        statusConfig: { fieldMapping: { effectiveDate: 'Effective Date' } },
      }),
    );

    expect(definition).toBeNull();
    expect(problems.join(' ')).toContain('statusConfig.engineId');
    expect(problems.join(' ')).toContain('ambetter-bob-v1');
  });

  it('refuses an empty statusConfig.fieldMapping (blanket-status trap)', () => {
    const { definition, problems } = validateCarrierConfigDefinition(
      createDefinition({
        statusConfig: { engineId: 'ambetter-bob-v1', fieldMapping: {} },
      }),
    );

    expect(definition).toBeNull();
    expect(problems.join(' ')).toContain('statusConfig.fieldMapping');
  });

  it('refuses a definition with neither carrierName nor carrierId', () => {
    const raw = createDefinition();

    delete raw.carrierName;

    const { definition, problems } = validateCarrierConfigDefinition(raw);

    expect(definition).toBeNull();
    expect(problems.join(' ')).toContain('carrierName or carrierId');
  });

  it('warns on unknown top-level keys without refusing', () => {
    const { definition, problems, warnings } = validateCarrierConfigDefinition(
      createDefinition({ policyNumberPatern: '^U' }),
    );

    expect(problems).toEqual([]);
    expect(definition).not.toBeNull();
    expect(warnings.join(' ')).toContain('policyNumberPatern');
  });
});

// ---------------------------------------------------------------------------
// Pre-flight (run-time boundary + engine registry)
// ---------------------------------------------------------------------------

describe('preflightCarrierConfigPayload', () => {
  it('refuses an unregistered status-engine id, listing the registered ids', () => {
    const payload = assembleCarrierConfigRecord(
      asDefinition(
        createDefinition({
          statusConfig: {
            engineId: 'uho-bob-v1',
            fieldMapping: { effectiveDate: 'Effective Date' },
          },
        }),
      ),
    );

    const { problems } = preflightCarrierConfigPayload('UHO', payload);

    expect(problems.join(' ')).toContain('not a registered status engine');
    expect(problems.join(' ')).toContain(STATUS_ENGINE_IDS.join(', '));
  });

  it('refuses an invalid policyNumberPattern regex via the run-time boundary error', () => {
    const payload = assembleCarrierConfigRecord(
      asDefinition(createDefinition({ policyNumberPattern: '[' })),
    );

    const { problems } = preflightCarrierConfigPayload('UHO', payload);

    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join(' ')).toContain('policyNumberPattern');
  });

  it('passes a clean assembled definition with zero warnings and resolves engine + startDate', () => {
    const payload = assembleCarrierConfigRecord(asDefinition(loadFixture()));

    const { problems, warnings, statusEngineId, startDate } =
      preflightCarrierConfigPayload('UHO', payload);

    expect(problems).toEqual([]);
    expect(warnings).toEqual([]);
    expect(statusEngineId).toBe('ambetter-bob-v1');
    expect(startDate).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Parity with the Ambetter seed's exported merge helpers (REUSE proof)
// ---------------------------------------------------------------------------

describe('parity with the Ambetter seed merge helpers', () => {
  it('reproduces buildCarrierConfigUpdate bit-for-bit when fed the Ambetter seed payload', () => {
    // The canonical Ambetter seed payload, straight from the exported helper.
    const ambetterSeed = buildCarrierConfigUpdate({}).value;
    const ambetterDefinition = asDefinition({
      name: 'Ambetter',
      carrierName: 'Ambetter',
      statusConfig: ambetterSeed.statusConfig as Record<string, unknown>,
      matchingConfig: ambetterSeed.matchingConfig as Record<string, unknown>,
      transformRules: ambetterSeed.transformRules as Record<string, unknown>,
      fieldConfig: ambetterSeed.fieldConfig as Record<string, unknown>[],
      policyNumberPattern: ambetterSeed.policyNumberPattern as string,
      productMapping: ambetterSeed.productMapping as Record<string, unknown>[],
      columnMapping: ambetterSeed.columnMapping as Record<string, unknown>,
    });

    // A record carrying user-captured + admin-tuned data of every merged kind.
    const existing = {
      columnMapping: {
        policy_number: {
          crmField: 'policyNumber',
          fieldType: 'TEXT',
          fieldKey: 'policyNumber',
        },
      },
      statusConfig: {
        fieldMapping: { paidThroughDate: 'paid_through_date' },
        placedThresholdDays: 45,
      },
      matchingConfig: { autoMatchThreshold: 99 },
      transformRules: { booleanTrue: ['y'] },
    };

    expect(
      buildGenericCarrierConfigUpdate(ambetterDefinition, existing),
    ).toEqual(buildCarrierConfigUpdate(existing));

    // And from-scratch (no existing record data) parity too.
    expect(buildGenericCarrierConfigUpdate(ambetterDefinition, {})).toEqual(
      buildCarrierConfigUpdate({}),
    );
  });
});

// ---------------------------------------------------------------------------
// Command behavior (stubbed repos)
// ---------------------------------------------------------------------------

describe('SeedCarrierConfigCommand', () => {
  it('--validate-only runs the full pre-flight but never writes', async () => {
    const { command, carrierConfigRepo, carrierRepo, errorSpy } =
      createCommand();

    command.parseFile(FIXTURE_PATH);
    command.parseValidateOnly();

    await runOnWorkspace(command);

    // Pre-flight actually ran: existing-record lookup + carrier resolution.
    expect(carrierConfigRepo.findOne).toHaveBeenCalledWith({
      where: { name: 'UHO' },
    });
    expect(carrierRepo.findOne).toHaveBeenCalled();
    // …but nothing was written and nothing failed.
    expect(carrierConfigRepo.save).not.toHaveBeenCalled();
    expect(carrierConfigRepo.update).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('creates the carrierConfig record when none exists, linking the resolved carrier', async () => {
    const { command, carrierConfigRepo, errorSpy } = createCommand();

    command.parseFile(FIXTURE_PATH);

    await runOnWorkspace(command);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(carrierConfigRepo.update).not.toHaveBeenCalled();
    expect(carrierConfigRepo.save).toHaveBeenCalledTimes(1);

    const saved = carrierConfigRepo.save.mock.calls[0][0] as Record<
      string,
      any
    >;

    expect(saved.name).toBe('UHO');
    expect(saved.carrierId).toBe(CARRIER_ID);
    expect(saved.parserVersion).toBe('ambetter-bob-v1');
    expect(saved.statusConfig.engineId).toBe('ambetter-bob-v1');
    expect(saved.statusConfig.fieldMapping.paidThroughDate).toBe(
      'Paid To Date',
    );
    // The explicit no-cutoff choice survives; defaults are filled for
    // visibility but never reintroduce the Ambetter onboarding date.
    expect(saved.matchingConfig.startDate).toBeNull();
    expect(saved.matchingConfig.autoMatchThreshold).toBe(90);
    expect(saved.matchingConfig.enabledTiers).toEqual(
      DEFAULT_MATCHING_CONFIG.enabledTiers,
    );
    expect(saved.policyNumberPattern).toBe('^[0-9]{9}$');

    // The written record passes the run-time boundary with zero warnings.
    const warnings: string[] = [];
    const parsed = parseCarrierPipelineConfig(
      { id: 'new-id', ...saved } as unknown as CarrierConfigRecord,
      { onWarning: (message) => warnings.push(message) },
    );

    expect(warnings).toEqual([]);
    expect(parsed.statusEngineId).toBe('ambetter-bob-v1');
    expect(parsed.startDate).toBeNull();
    expect(parsed.policyNumberPattern?.test('123456789')).toBe(true);
    expect(parsed.policyNumberPattern?.test('U12345')).toBe(false);
  });

  it('merge-updates an existing record, preserving user-captured data (existing wins)', async () => {
    const existingConfig = {
      id: 'existing-uho-config',
      name: 'UHO',
      carrierId: CARRIER_ID,
      columnMapping: {
        policy_number: {
          crmField: 'policyNumber',
          fieldType: 'TEXT',
          fieldKey: 'policyNumber',
        },
      },
      statusConfig: {
        engineId: 'ambetter-bob-v1',
        fieldMapping: { paidThroughDate: 'paid_to' },
      },
      matchingConfig: { startDate: null, autoMatchThreshold: 95 },
      transformRules: { booleanTrue: ['y'] },
    };
    const { command, carrierConfigRepo, errorSpy } = createCommand({
      existingConfig,
    });

    command.parseFile(FIXTURE_PATH);

    await runOnWorkspace(command);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(carrierConfigRepo.save).not.toHaveBeenCalled();
    expect(carrierConfigRepo.update).toHaveBeenCalledTimes(1);

    const [criteria, update] = carrierConfigRepo.update.mock
      .calls[0] as unknown as [Record<string, unknown>, Record<string, any>];

    expect(criteria).toEqual({ id: 'existing-uho-config' });
    // User-captured column mapping wins; missing seed headers are filled.
    expect(update.columnMapping.policy_number).toEqual(
      existingConfig.columnMapping.policy_number,
    );
    expect(update.columnMapping['Policy Number'].crmField).toBe('policyNumber');
    // User-captured status role wins; missing roles are filled from the seed.
    expect(update.statusConfig.fieldMapping.paidThroughDate).toBe('paid_to');
    expect(update.statusConfig.fieldMapping.effectiveDate).toBe(
      'Effective Date',
    );
    // Admin-tuned matching knobs win over the definition's values.
    expect(update.matchingConfig.autoMatchThreshold).toBe(95);
    expect(update.matchingConfig.startDate).toBeNull();
    // Recognized transform keys win; the rest is filled.
    expect(update.transformRules.booleanTrue).toEqual(['y']);
    expect(update.transformRules.dateFormats).toEqual(['MM/DD/YYYY']);
    // The existing carrier link is never overwritten.
    expect(update.carrierId).toBeUndefined();
  });

  it('fills a missing carrier link on merge without touching anything else', async () => {
    const { command, carrierConfigRepo } = createCommand({
      existingConfig: {
        id: 'existing-uho-config',
        name: 'UHO',
        carrierId: null,
        statusConfig: {
          engineId: 'ambetter-bob-v1',
          fieldMapping: { paidThroughDate: 'paid_to' },
        },
        matchingConfig: { startDate: null },
      },
    });

    command.parseFile(FIXTURE_PATH);

    await runOnWorkspace(command);

    const [, update] = carrierConfigRepo.update.mock.calls[0] as unknown as [
      Record<string, unknown>,
      Record<string, any>,
    ];

    expect(update.carrierId).toBe(CARRIER_ID);
  });

  it('refuses (no writes) when the carrier record cannot be resolved', async () => {
    const { command, carrierConfigRepo, errorSpy } = createCommand({
      carrier: null,
    });

    command.parseFile(FIXTURE_PATH);

    await runOnWorkspace(command);

    expect(carrierConfigRepo.save).not.toHaveBeenCalled();
    expect(carrierConfigRepo.update).not.toHaveBeenCalled();
    expect(errorSpy.mock.calls.flat().join(' ')).toContain('REFUSED');
    expect(errorSpy.mock.calls.flat().join(' ')).toContain('carrierName');
  });

  it('refuses (no writes) when the definition names an unregistered status engine', async () => {
    const { command, carrierConfigRepo, errorSpy } = createCommand();
    const file = writeDefinitionFile(
      createDefinition({
        statusConfig: {
          engineId: 'uho-bob-v1',
          fieldMapping: { effectiveDate: 'Effective Date' },
        },
      }),
    );

    command.parseFile(file);

    await runOnWorkspace(command);

    expect(carrierConfigRepo.save).not.toHaveBeenCalled();
    expect(carrierConfigRepo.update).not.toHaveBeenCalled();
    expect(errorSpy.mock.calls.flat().join(' ')).toContain(
      'not a registered status engine',
    );
  });

  it('refuses (no writes) when matchingConfig omits the explicit startDate key', async () => {
    const { command, carrierConfigRepo, errorSpy } = createCommand();
    const file = writeDefinitionFile(
      createDefinition({ matchingConfig: { autoMatchThreshold: 90 } }),
    );

    command.parseFile(file);

    await runOnWorkspace(command);

    // Refused before any repo access.
    expect(carrierConfigRepo.findOne).not.toHaveBeenCalled();
    expect(carrierConfigRepo.save).not.toHaveBeenCalled();
    expect(carrierConfigRepo.update).not.toHaveBeenCalled();
    expect(errorSpy.mock.calls.flat().join(' ')).toContain(
      'matchingConfig.startDate',
    );
  });
});
