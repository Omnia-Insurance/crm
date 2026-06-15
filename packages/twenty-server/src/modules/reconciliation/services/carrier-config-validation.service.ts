// OMNIA-CUSTOM: synchronous carrier-config validation (OMN-11; multi-carrier
// readiness audit 2026-06-11 §"validateCarrierConfig resolver with preview").
//
// Runs the SAME fail-fast chain as the pipeline jobs — without enqueuing
// anything or writing anywhere:
//
//   parseCarrierPipelineConfig (onWarning collected, validation problems
//   caught) → isKnownStatusEngine → validateStatusEngineParams →
//   resolveFieldMapping + validateStatusRoleMapping against the engine's
//   requiredRoles (presence, then resolvability)
//
// mirroring parse.job.ts steps 3–onwards and match.job.ts#loadMatchContext.
// The reference for the chain is the e2e harness in
// engines/__tests__/pipeline-real-data.spec.ts.
//
// The OMN-12 parse-vocabulary fail-fasts (dateFormats token grammar,
// parseSettings headerRow/rowFilters semantic validation, computed-field
// params validation) all live INSIDE parseCarrierPipelineConfig, so step 2
// below replays them automatically — no separate mirroring code is needed
// (covered by tests in __tests__/carrier-config-validation.service.spec.ts).
//
// Header preview source: the parsed-data.json attachment of this carrier's
// most recent parsed run (readParsedData), NOT the stored columnMapping
// snapshot. The snapshot holds only CRM-mapped headers, so status roles that
// legitimately point at non-CRM headers or computed outputs would
// false-positive as unresolved; the parsed rows' keys are exactly the
// surface the match job itself resolves against (match.job.ts
// loadMatchContext samples parsedRows[0]). readSourceFile is deliberately
// avoided — it pins sourceAttachmentId as a side effect, and this service
// must stay read-only.

import { Injectable, Logger } from '@nestjs/common';

import { IsNull, Not } from 'typeorm';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import {
  getStatusEngine,
  STATUS_ENGINE_IDS,
  validateStatusEngineParams,
} from 'src/modules/reconciliation/engines/status';
import {
  resolveFieldMapping,
  validateStatusRoleMapping,
} from 'src/modules/reconciliation/parsers/transforms';
import { ReconciliationAttachmentService } from 'src/modules/reconciliation/services/attachment.service';
import { ReconciliationDataService } from 'src/modules/reconciliation/services/data.service';
import {
  parseCarrierPipelineConfig,
  type CarrierPipelineConfig,
} from 'src/modules/reconciliation/types/carrier-config';
import type { ReconciliationRecord } from 'src/modules/reconciliation/types/reconciliation';
import { mergeRunWarnings } from 'src/modules/reconciliation/utils/config-fingerprint.util';

export type ValidateCarrierConfigResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  engineId: string | null;
  startDate: string | null;
  requiredRolesMissing: string[];
  headersChecked: boolean;
};

@Injectable()
export class CarrierConfigValidationService {
  private readonly logger = new Logger(CarrierConfigValidationService.name);

  constructor(
    private readonly dataService: ReconciliationDataService,
    private readonly attachmentService: ReconciliationAttachmentService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  /**
   * Validate a carrier config without running it. Never throws on config
   * problems — every failure a real run would hit lands in `errors`, every
   * diagnostic a real run would log lands in `warnings`.
   */
  async validateCarrierConfig(
    workspaceId: string,
    carrierConfigId: string,
  ): Promise<ValidateCarrierConfigResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const requiredRolesMissing: string[] = [];
    let engineId: string | null = null;
    let startDate: string | null = null;
    let headersChecked = false;

    try {
      // --- 1. Load the carrierConfig record ---
      const carrierConfig = await this.dataService.getCarrierConfig(
        workspaceId,
        carrierConfigId,
      );

      // --- 2. Boundary validation (parseCarrierPipelineConfig) ---
      // CarrierConfigValidationError carries the exact key + problem list;
      // a malformed config stops here exactly as a real run would.
      let pipelineConfig: CarrierPipelineConfig;

      try {
        pipelineConfig = parseCarrierPipelineConfig(carrierConfig, {
          onWarning: (message) => warnings.push(message),
        });
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));

        return this.buildResult({
          errors,
          warnings,
          engineId,
          startDate,
          requiredRolesMissing,
          headersChecked,
        });
      }

      engineId = pipelineConfig.statusEngineId;
      startDate = pipelineConfig.startDate;

      // --- 3. Engine id validation (same message as parse.job.ts) ---
      const statusEngine = getStatusEngine(pipelineConfig.statusEngineId);

      if (!statusEngine) {
        errors.push(
          `Unknown status engine id "${pipelineConfig.statusEngineId}" on carrier config ` +
            `"${carrierConfig.name}". Known engines: ${STATUS_ENGINE_IDS.join(', ')}. ` +
            `Fix statusConfig.engineId on the carrier config and re-run.`,
        );

        return this.buildResult({
          errors,
          warnings,
          engineId,
          startDate,
          requiredRolesMissing,
          headersChecked,
        });
      }

      // --- 4. engineParams validation against the engine's paramsSchema ---
      try {
        validateStatusEngineParams(statusEngine, pipelineConfig.engineParams);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }

      // --- 5. Role mapping: presence + (when possible) resolvability ---
      // Preview headers come from the latest parsed run for THIS carrier
      // config; without one, only presence can be checked (headersChecked
      // stays false so callers know resolvability was not previewed).
      const actualHeaders = await this.loadPreviewHeaders(
        workspaceId,
        carrierConfigId,
        warnings,
      );

      const statusFieldMapping = pipelineConfig.statusFieldMapping;
      const computedFields = pipelineConfig.computedFields;

      if (actualHeaders !== null) {
        headersChecked = true;

        const resolvedMapping = resolveFieldMapping(
          statusFieldMapping,
          actualHeaders,
        );
        const roleValidation = validateStatusRoleMapping(
          resolvedMapping,
          actualHeaders,
          computedFields,
          statusEngine.requiredRoles,
        );

        if (roleValidation.missingRequired.length > 0) {
          requiredRolesMissing.push(...roleValidation.missingRequired);
          errors.push(
            `Status engine "${statusEngine.id}" requires role(s) not present in ` +
              `statusConfig.fieldMapping: ${roleValidation.missingRequired.join(', ')}. ` +
              `Map each required role to a file header or computed-field output ` +
              `on the carrier config and re-run.`,
          );
        }

        if (roleValidation.unresolvedRequired.length > 0) {
          requiredRolesMissing.push(
            ...roleValidation.unresolvedRequired.map(({ role }) => role),
          );

          const detail = roleValidation.unresolvedRequired
            .map(
              ({ role, configuredHeader }) => `${role} → "${configuredHeader}"`,
            )
            .join(', ');

          errors.push(
            `Status-engine required role(s) resolve to no file header or computed-field output: ${detail}. ` +
              `Fix statusConfig.fieldMapping on the carrier config (or the file headers) and re-run.`,
          );
        }

        for (const {
          role,
          configuredHeader,
        } of roleValidation.unresolvedOptional) {
          warnings.push(
            `Status role "${role}" is mapped to "${configuredHeader}", which matches no file header or computed-field output — ` +
              `the status engine will receive null for this role on every row`,
          );
        }
      } else {
        // Presence-only validation: the same missingRequired check
        // validateStatusRoleMapping performs, needing no headers.
        const missing = statusEngine.requiredRoles.filter(
          (role) => !(role in statusFieldMapping),
        );

        if (missing.length > 0) {
          requiredRolesMissing.push(...missing);
          errors.push(
            `Status engine "${statusEngine.id}" requires role(s) not present in ` +
              `statusConfig.fieldMapping: ${missing.join(', ')}. ` +
              `Map each required role to a file header or computed-field output ` +
              `on the carrier config and re-run.`,
          );
        }
      }
    } catch (error) {
      // Catch-all (record not found, storage failures, …): the resolver
      // contract is "never throw on config problems" — report and return.
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return this.buildResult({
      errors,
      warnings,
      engineId,
      startDate,
      requiredRolesMissing,
      headersChecked,
    });
  }

  /**
   * Headers of the most recent parsed run for this carrier config, or null
   * when none exists (or its parsed-data attachment cannot be read — that
   * downgrade is reported as a warning, not an error, because a real run
   * would re-create the attachment).
   */
  private async loadPreviewHeaders(
    workspaceId: string,
    carrierConfigId: string,
    warnings: string[],
  ): Promise<string[] | null> {
    const latestParsed = await this.findLatestParsedReconciliation(
      workspaceId,
      carrierConfigId,
    );

    if (!latestParsed) {
      warnings.push(
        'No previous parsed run found for this carrier config — header ' +
          'resolution was not previewed (role presence only). Run a real ' +
          'file once to enable full validation.',
      );

      return null;
    }

    try {
      const parsedRows = await this.attachmentService.readParsedData(
        workspaceId,
        latestParsed.id,
      );

      if (parsedRows.length === 0) {
        warnings.push(
          `Latest parsed run ${latestParsed.id} contains no rows — header ` +
            'resolution was not previewed (role presence only).',
        );

        return null;
      }

      return Object.keys(parsedRows[0] as Record<string, unknown>);
    } catch (error) {
      this.logger.warn(
        `validateCarrierConfig: could not read parsed data of run ${latestParsed.id}: ` +
          (error instanceof Error ? error.message : String(error)),
      );
      warnings.push(
        `Could not read the parsed data of the latest run (${latestParsed.id}) — ` +
          'header resolution was not previewed (role presence only).',
      );

      return null;
    }
  }

  /** Newest reconciliation for this carrier config that has completed a
   *  parse (parsedAt stamped ⇒ parsed-data.json attachment written). */
  private async findLatestParsedReconciliation(
    workspaceId: string,
    carrierConfigId: string,
  ): Promise<ReconciliationRecord | null> {
    const authContext = buildSystemAuthContext(workspaceId);

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const repo = await this.globalWorkspaceOrmManager.getRepository(
          workspaceId,
          'reconciliation',
          { shouldBypassPermissionChecks: true },
        );

        const records = await repo.find({
          where: { carrierConfigId, parsedAt: Not(IsNull()) },
          order: { parsedAt: 'DESC' },
          take: 1,
        });

        return records.length > 0
          ? (records[0] as unknown as ReconciliationRecord)
          : null;
      },
      authContext,
    );
  }

  private buildResult({
    errors,
    warnings,
    engineId,
    startDate,
    requiredRolesMissing,
    headersChecked,
  }: Omit<ValidateCarrierConfigResult, 'valid'>): ValidateCarrierConfigResult {
    return {
      valid: errors.length === 0,
      errors,
      // Same dedupe/cap policy as the persisted stats.warnings.
      warnings: mergeRunWarnings(warnings),
      engineId,
      startDate,
      requiredRolesMissing: [...new Set(requiredRolesMissing)],
      headersChecked,
    };
  }
}
