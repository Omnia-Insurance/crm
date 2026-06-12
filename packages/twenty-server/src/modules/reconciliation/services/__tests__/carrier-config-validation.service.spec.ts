// OMNIA-CUSTOM: tests for the synchronous validateCarrierConfig chain
// (OMN-11). Contract under test: the service runs the SAME fail-fast gates
// as parse.job/match.job — boundary parse, engine id, engineParams, role
// presence/resolvability — without enqueuing or writing anything, and NEVER
// throws on config problems (everything lands in errors[]).

import { Logger } from '@nestjs/common';

import { CarrierConfigValidationService } from 'src/modules/reconciliation/services/carrier-config-validation.service';
import type { ReconciliationAttachmentService } from 'src/modules/reconciliation/services/attachment.service';
import type { ReconciliationDataService } from 'src/modules/reconciliation/services/data.service';
import type { CarrierConfigRecord } from 'src/modules/reconciliation/types/reconciliation';

const WORKSPACE_ID = 'workspace-id';
const CARRIER_CONFIG_ID = 'carrier-config-id';
const LATEST_RUN_ID = 'reconciliation-latest';

const validCarrierConfig = (
  overrides: Partial<CarrierConfigRecord> = {},
): CarrierConfigRecord => ({
  id: CARRIER_CONFIG_ID,
  name: 'Ambetter',
  parserVersion: null,
  fieldConfig: null,
  matchingConfig: { startDate: null },
  statusConfig: {
    engineId: 'ambetter-bob-v1',
    fieldMapping: {
      effectiveDate: 'Effective Date',
      paidThroughDate: 'Paid Through Date',
    },
  },
  carrierId: 'carrier-id',
  policyNumberPattern: '^U',
  columnMapping: null,
  productMapping: null,
  ...overrides,
});

const PARSED_ROWS = [
  {
    'Effective Date': '2025-08-01',
    'Paid Through Date': '2026-03-31',
    'Policy Number': 'U123',
  },
];

const createHarness = ({
  carrierConfig = validCarrierConfig(),
  latestParsedRun = { id: LATEST_RUN_ID, parsedAt: '2026-06-01T00:00:00Z' },
  parsedRows = PARSED_ROWS,
}: {
  carrierConfig?: CarrierConfigRecord | Error;
  latestParsedRun?: Record<string, unknown> | null;
  parsedRows?: Record<string, unknown>[] | Error;
} = {}) => {
  const dataService = {
    getCarrierConfig: jest.fn(async () => {
      if (carrierConfig instanceof Error) throw carrierConfig;

      return carrierConfig;
    }),
  };
  const attachmentService = {
    readParsedData: jest.fn(async () => {
      if (parsedRows instanceof Error) throw parsedRows;

      return parsedRows;
    }),
  };
  const reconciliationRepo = {
    find: jest.fn(async () => (latestParsedRun ? [latestParsedRun] : [])),
  };
  const globalWorkspaceOrmManager = {
    executeInWorkspaceContext: jest.fn(
      async (callback: () => Promise<unknown>) => callback(),
    ),
    getRepository: jest.fn(async () => reconciliationRepo),
  };

  const service = new CarrierConfigValidationService(
    dataService as unknown as ReconciliationDataService,
    attachmentService as unknown as ReconciliationAttachmentService,
    globalWorkspaceOrmManager as never,
  );

  return {
    service,
    dataService,
    attachmentService,
    reconciliationRepo,
  };
};

describe('CarrierConfigValidationService.validateCarrierConfig', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns valid with headers previewed against the latest parsed run', async () => {
    const { service, attachmentService } = createHarness();

    const result = await service.validateCarrierConfig(
      WORKSPACE_ID,
      CARRIER_CONFIG_ID,
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.engineId).toBe('ambetter-bob-v1');
    expect(result.startDate).toBeNull();
    expect(result.requiredRolesMissing).toEqual([]);
    expect(result.headersChecked).toBe(true);
    expect(attachmentService.readParsedData).toHaveBeenCalledWith(
      WORKSPACE_ID,
      LATEST_RUN_ID,
    );
  });

  it('reports malformed config JSON as errors instead of throwing', async () => {
    const { service } = createHarness({
      carrierConfig: validCarrierConfig({
        matchingConfig: {
          autoMatchThreshold: 'eighty-five',
        } as never,
      }),
    });

    const result = await service.validateCarrierConfig(
      WORKSPACE_ID,
      CARRIER_CONFIG_ID,
    );

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(
      /matchingConfig\.autoMatchThreshold/,
    );
    // Boundary failed — no resolved engine surface to report.
    expect(result.engineId).toBeNull();
    expect(result.headersChecked).toBe(false);
  });

  it('mirrors the boundary automatically: an out-of-scale discovery threshold lands in errors[] (OMN-12)', async () => {
    // validateCarrierConfig replays parseCarrierPipelineConfig, so the new
    // live-knob validation (discovery thresholds are 0-1 scores) surfaces
    // here without any service change.
    const { service } = createHarness({
      carrierConfig: validCarrierConfig({
        matchingConfig: {
          startDate: null,
          enableDiscovery: true,
          discoveryNameThreshold: 95,
        },
      }),
    });

    const result = await service.validateCarrierConfig(
      WORKSPACE_ID,
      CARRIER_CONFIG_ID,
    );

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(
      /matchingConfig\.discoveryNameThreshold/,
    );
  });

  it('reports an unknown status engine id with the known-engines list', async () => {
    const { service } = createHarness({
      carrierConfig: validCarrierConfig({
        statusConfig: {
          engineId: 'uho-bob-v1',
          fieldMapping: {
            effectiveDate: 'Effective Date',
            paidThroughDate: 'Paid Through Date',
          },
        },
      }),
    });

    const result = await service.validateCarrierConfig(
      WORKSPACE_ID,
      CARRIER_CONFIG_ID,
    );

    expect(result.valid).toBe(false);
    expect(result.engineId).toBe('uho-bob-v1');
    expect(result.errors.join(' ')).toMatch(
      /Unknown status engine id "uho-bob-v1".*Known engines: ambetter-bob-v1/,
    );
  });

  it('reports engineParams rejected by the engine schema', async () => {
    const { service } = createHarness({
      carrierConfig: validCarrierConfig({
        statusConfig: {
          engineId: 'ambetter-bob-v1',
          engineParams: { placedThresholdDays: 'thirty' } as never,
          fieldMapping: {
            effectiveDate: 'Effective Date',
            paidThroughDate: 'Paid Through Date',
          },
        },
      }),
    });

    const result = await service.validateCarrierConfig(
      WORKSPACE_ID,
      CARRIER_CONFIG_ID,
    );

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/engineParams/);
  });

  it('falls back to presence-only validation when no parsed run exists', async () => {
    const { service, attachmentService } = createHarness({
      latestParsedRun: null,
      carrierConfig: validCarrierConfig({
        statusConfig: {
          engineId: 'ambetter-bob-v1',
          // paidThroughDate missing entirely → presence failure.
          fieldMapping: { effectiveDate: 'Effective Date' },
        },
      }),
    });

    const result = await service.validateCarrierConfig(
      WORKSPACE_ID,
      CARRIER_CONFIG_ID,
    );

    expect(result.valid).toBe(false);
    expect(result.headersChecked).toBe(false);
    expect(result.requiredRolesMissing).toEqual(['paidThroughDate']);
    expect(result.errors.join(' ')).toMatch(
      /requires role\(s\) not present.*paidThroughDate/,
    );
    expect(result.warnings.join(' ')).toMatch(/No previous parsed run/);
    expect(attachmentService.readParsedData).not.toHaveBeenCalled();
  });

  it('passes presence-only validation when required roles are mapped (no run)', async () => {
    const { service } = createHarness({ latestParsedRun: null });

    const result = await service.validateCarrierConfig(
      WORKSPACE_ID,
      CARRIER_CONFIG_ID,
    );

    expect(result.valid).toBe(true);
    expect(result.headersChecked).toBe(false);
    expect(result.requiredRolesMissing).toEqual([]);
  });

  it('flags a required role that resolves to no real header (with preview)', async () => {
    const { service } = createHarness({
      carrierConfig: validCarrierConfig({
        statusConfig: {
          engineId: 'ambetter-bob-v1',
          fieldMapping: {
            effectiveDate: 'Effective Date',
            paidThroughDate: 'Paid Thru', // renamed in the carrier's file
          },
        },
      }),
    });

    const result = await service.validateCarrierConfig(
      WORKSPACE_ID,
      CARRIER_CONFIG_ID,
    );

    expect(result.valid).toBe(false);
    expect(result.headersChecked).toBe(true);
    expect(result.requiredRolesMissing).toEqual(['paidThroughDate']);
    expect(result.errors.join(' ')).toMatch(
      /resolve to no file header.*paidThroughDate → "Paid Thru"/,
    );
  });

  it('warns (not errors) on unresolved optional roles', async () => {
    const { service } = createHarness({
      carrierConfig: validCarrierConfig({
        statusConfig: {
          engineId: 'ambetter-bob-v1',
          fieldMapping: {
            effectiveDate: 'Effective Date',
            paidThroughDate: 'Paid Through Date',
            termDate: 'Termination Date', // not in the parsed headers
          },
        },
      }),
    });

    const result = await service.validateCarrierConfig(
      WORKSPACE_ID,
      CARRIER_CONFIG_ID,
    );

    expect(result.valid).toBe(true);
    expect(result.warnings.join(' ')).toMatch(
      /termDate.*Termination Date.*matches no file header/,
    );
  });

  it('counts a computed-field output key as a resolvable header', async () => {
    const { service } = createHarness({
      carrierConfig: validCarrierConfig({
        fieldConfig: [
          {
            outputKey: 'True Effective Date',
            method: 'maxDate',
            inputs: ['Effective Date', 'Broker Effective Date'],
            type: 'date',
          },
        ],
        statusConfig: {
          engineId: 'ambetter-bob-v1',
          fieldMapping: {
            effectiveDate: 'True Effective Date',
            paidThroughDate: 'Paid Through Date',
          },
        },
      }),
    });

    const result = await service.validateCarrierConfig(
      WORKSPACE_ID,
      CARRIER_CONFIG_ID,
    );

    expect(result.valid).toBe(true);
    expect(result.headersChecked).toBe(true);
  });

  it('downgrades to presence-only with a warning when parsed data is unreadable', async () => {
    const { service } = createHarness({
      parsedRows: new Error('storage gone'),
    });

    const result = await service.validateCarrierConfig(
      WORKSPACE_ID,
      CARRIER_CONFIG_ID,
    );

    expect(result.valid).toBe(true);
    expect(result.headersChecked).toBe(false);
    expect(result.warnings.join(' ')).toMatch(/Could not read the parsed data/);
  });

  it('surfaces boundary onWarning messages (legacy engine-id fallback)', async () => {
    const { service } = createHarness({
      carrierConfig: validCarrierConfig({
        statusConfig: {
          // no engineId → parserVersion → legacy default fallback warning
          fieldMapping: {
            effectiveDate: 'Effective Date',
            paidThroughDate: 'Paid Through Date',
          },
        },
      }),
    });

    const result = await service.validateCarrierConfig(
      WORKSPACE_ID,
      CARRIER_CONFIG_ID,
    );

    expect(result.valid).toBe(true);
    expect(result.engineId).toBe('ambetter-bob-v1');
    expect(result.warnings.join(' ')).toMatch(/fallback is deprecated/);
  });

  it('never throws — a missing carrierConfig record lands in errors', async () => {
    const { service } = createHarness({
      carrierConfig: new Error(
        `CarrierConfig ${CARRIER_CONFIG_ID} not found in workspace ${WORKSPACE_ID}`,
      ),
    });

    const result = await service.validateCarrierConfig(
      WORKSPACE_ID,
      CARRIER_CONFIG_ID,
    );

    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/not found in workspace/);
    expect(result.engineId).toBeNull();
  });

  // --- OMN-12 parse-vocabulary fail-fasts ride through step 2 (the
  // boundary parse), so the resolver mirrors them with no extra code. ---
  describe('OMN-12 parse-vocabulary mirroring', () => {
    it('reports an unknown dateFormats token as a config error', async () => {
      const { service } = createHarness({
        carrierConfig: validCarrierConfig({
          transformRules: { dateFormats: ['MM/DD/YYYY', 'YYYY.MM.DD'] },
        } as never),
      });

      const result = await service.validateCarrierConfig(
        WORKSPACE_ID,
        CARRIER_CONFIG_ID,
      );

      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(
        /unknown date format token "YYYY\.MM\.DD"/,
      );
    });

    it('reports a malformed parseSettings.headerRow as a config error', async () => {
      const { service } = createHarness({
        carrierConfig: validCarrierConfig({
          parseSettings: { headerRow: 0 },
        } as never),
      });

      const result = await service.validateCarrierConfig(
        WORKSPACE_ID,
        CARRIER_CONFIG_ID,
      );

      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/parseSettings\.headerRow/);
    });

    it('reports a semantically invalid row filter as a config error', async () => {
      const { service } = createHarness({
        carrierConfig: validCarrierConfig({
          parseSettings: {
            rowFilters: [{ column: 'A', op: 'equals', action: 'skip' }],
          },
        } as never),
      });

      const result = await service.validateCarrierConfig(
        WORKSPACE_ID,
        CARRIER_CONFIG_ID,
      );

      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(
        /parseSettings\.rowFilters\.0: op "equals" requires a non-empty string "value"/,
      );
    });

    it('reports bad computed-field params (unsafe arithmetic expr) as errors', async () => {
      const { service } = createHarness({
        carrierConfig: validCarrierConfig({
          fieldConfig: [
            {
              outputKey: 'Monthly',
              method: 'arithmetic',
              inputs: ['Annual'],
              params: { expr: 'eval("1")' },
              type: 'number',
            },
          ],
        } as never),
      });

      const result = await service.validateCarrierConfig(
        WORKSPACE_ID,
        CARRIER_CONFIG_ID,
      );

      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(
        /identifiers\/functions are not allowed/,
      );
    });

    it('passes a config exercising the full new vocabulary', async () => {
      const { service } = createHarness({
        carrierConfig: validCarrierConfig({
          transformRules: { dateFormats: ['D MMM YYYY', 'MM-DD-YYYY'] },
          parseSettings: {
            headerRow: 3,
            skipFooterRows: 1,
            rowFilters: [
              {
                column: 'Policy Number',
                op: 'matches',
                value: '^(Total|Subtotal)',
                action: 'skip',
              },
            ],
          },
          fieldConfig: [
            {
              outputKey: 'Monthly Premium',
              method: 'arithmetic',
              inputs: ['Annual Premium'],
              params: { expr: '$1 / 12' },
              type: 'number',
            },
          ],
        } as never),
      });

      const result = await service.validateCarrierConfig(
        WORKSPACE_ID,
        CARRIER_CONFIG_ID,
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  // --- OMN-12 tuning depth: diffConfig + statusVocabulary live inside the
  // boundary parse (step 2), so the resolver mirrors the new fail-fasts and
  // warnings with no extra code. ---
  describe('OMN-12 tuning-depth mirroring (diffConfig + statusVocabulary)', () => {
    it('reports a mistyped diffConfig knob as a config error', async () => {
      const { service } = createHarness({
        carrierConfig: validCarrierConfig({
          diffConfig: { suppressAgentFields: 'no' },
        } as never),
      });

      const result = await service.validateCarrierConfig(
        WORKSPACE_ID,
        CARRIER_CONFIG_ID,
      );

      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(
        /diffConfig\.suppressAgentFields/,
      );
    });

    it('reports an empty statusVocabulary list as a config error', async () => {
      const { service } = createHarness({
        carrierConfig: validCarrierConfig({
          statusVocabulary: { negativeTerminalStatuses: [] },
        } as never),
      });

      const result = await service.validateCarrierConfig(
        WORKSPACE_ID,
        CARRIER_CONFIG_ID,
      );

      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(
        /statusVocabulary\.negativeTerminalStatuses/,
      );
    });

    it('surfaces the unknown-status warning while keeping the config valid', async () => {
      const { service } = createHarness({
        carrierConfig: validCarrierConfig({
          diffConfig: { suppressAcaRolloverEffectiveDate: false },
          statusVocabulary: {
            negativeTerminalStatuses: ['CANCELED', 'GRACE_PERIOD'],
          },
        } as never),
      });

      const result = await service.validateCarrierConfig(
        WORKSPACE_ID,
        CARRIER_CONFIG_ID,
      );

      expect(result.valid).toBe(true);
      expect(result.warnings.join(' ')).toMatch(/"GRACE_PERIOD"/);
    });
  });

  describe('OMN-12 identity + post-match strategy mirroring', () => {
    it('reports a bad identifierRoles CRM path as a config error (boundary replay)', async () => {
      const { service } = createHarness({
        carrierConfig: validCarrierConfig({
          matchingConfig: {
            startDate: null,
            identifierRoles: { memberId: 'policy.memberNumber' },
          },
        } as never),
      });

      const result = await service.validateCarrierConfig(
        WORKSPACE_ID,
        CARRIER_CONFIG_ID,
      );

      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(
        /identifierRoles\.memberId.*unknown identifier CRM field/,
      );
    });

    it('reports an uncompilable identifierNormalization.stripSuffixPattern', async () => {
      const { service } = createHarness({
        carrierConfig: validCarrierConfig({
          matchingConfig: {
            startDate: null,
            identifierNormalization: { stripSuffixPattern: '[unclosed' },
          },
        } as never),
      });

      const result = await service.validateCarrierConfig(
        WORKSPACE_ID,
        CARRIER_CONFIG_ID,
      );

      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(
        /stripSuffixPattern.*not a valid regular expression/,
      );
    });

    it('reports an unknown dedupStrategy with the valid-strategies list', async () => {
      const { service } = createHarness({
        carrierConfig: validCarrierConfig({
          matchingConfig: {
            startDate: null,
            dedupStrategy: 'keepNewest',
          },
        } as never),
      });

      const result = await service.validateCarrierConfig(
        WORKSPACE_ID,
        CARRIER_CONFIG_ID,
      );

      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(
        /unknown dedup strategy "keepNewest".*keepNewestEffectiveDate, keepAll, keepFirst/,
      );
    });

    it('passes a config exercising the full identity/strategy vocabulary', async () => {
      const { service } = createHarness({
        carrierConfig: validCarrierConfig({
          matchingConfig: {
            startDate: null,
            identifierRoles: { memberId: 'applicationId' },
            identifierNormalization: {
              stripPrefix: 'ABC',
              stripSuffixPattern: '-\\d+$',
              stripLeadingZeros: true,
            },
            dedupStrategy: 'keepAll',
            narrowingStrategies: ['activeStatus'],
          },
        } as never),
      });

      const result = await service.validateCarrierConfig(
        WORKSPACE_ID,
        CARRIER_CONFIG_ID,
      );

      expect(result.valid).toBe(true);
    });
  });
});
