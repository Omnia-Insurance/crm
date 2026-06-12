// OMNIA-CUSTOM: GraphQL resolver for reconciliation pipeline operations.
// Exposes mutations to trigger parsing and matching from the frontend.

import {
  BadRequestException,
  UseFilters,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { Args, Float, Mutation, Query } from '@nestjs/graphql';

import { PermissionFlagType } from 'twenty-shared/constants';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { SettingsPermissionGuard } from 'src/engine/guards/settings-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { StartReconciliationResultDTO } from 'src/modules/reconciliation/dtos/start-reconciliation.dto';
import { ValidateCarrierConfigResultDTO } from 'src/modules/reconciliation/dtos/validate-carrier-config.dto';
import { ReconciliationOrchestratorService } from 'src/modules/reconciliation/orchestrator.service';
import { CarrierConfigValidationService } from 'src/modules/reconciliation/services/carrier-config-validation.service';
import { ReviewItemService } from 'src/modules/reconciliation/services/review-item.service';

@MetadataResolver()
@UsePipes(ResolverValidationPipe)
@UseFilters(AuthGraphqlApiExceptionFilter)
@UseGuards(
  WorkspaceAuthGuard,
  SettingsPermissionGuard(PermissionFlagType.RECONCILIATION),
)
export class ReconciliationResolver {
  constructor(
    private readonly orchestratorService: ReconciliationOrchestratorService,
    private readonly reviewItemService: ReviewItemService,
    private readonly carrierConfigValidationService: CarrierConfigValidationService,
  ) {}

  /**
   * Synchronous pre-run config validation (OMN-11): runs the full parse/match
   * fail-fast chain — boundary parse, engine id, engineParams, status-role
   * presence/resolvability against the latest parsed run's actual headers —
   * WITHOUT enqueuing anything. Config problems land in `errors`, never as a
   * thrown GraphQL error (see CarrierConfigValidationService).
   */
  @Query(() => ValidateCarrierConfigResultDTO)
  async validateCarrierConfig(
    @Args('carrierConfigId', { type: () => UUIDScalarType })
    carrierConfigId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<ValidateCarrierConfigResultDTO> {
    return this.carrierConfigValidationService.validateCarrierConfig(
      workspace.id,
      carrierConfigId,
    );
  }

  /**
   * Starts (or restarts) parsing. Legal from UPLOADED, FAILED, and — since
   * OMN-11 — REVIEW, so parse-time knob edits (transformRules, computed
   * fields, hand-edited columnMapping snapshot) can be re-applied to the
   * same pinned source file without a re-upload. The CAS transition inside
   * the orchestrator serializes concurrent restarts; reviewer decisions
   * survive the downstream re-match (ReviewItemService.reconcileMatchResults
   * preserves decided items).
   */
  @Mutation(() => StartReconciliationResultDTO)
  async startReconciliationParsing(
    @Args('reconciliationId', { type: () => UUIDScalarType })
    reconciliationId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<StartReconciliationResultDTO> {
    await this.orchestratorService.startParsing(workspace.id, reconciliationId);

    return {
      success: true,
      reconciliationId,
      status: 'PARSING',
    };
  }

  @Mutation(() => StartReconciliationResultDTO)
  async startReconciliationMatching(
    @Args('reconciliationId', { type: () => UUIDScalarType })
    reconciliationId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<StartReconciliationResultDTO> {
    await this.orchestratorService.startMatching(
      workspace.id,
      reconciliationId,
    );

    return {
      success: true,
      reconciliationId,
      status: 'MATCHING',
    };
  }

  @Mutation(() => StartReconciliationResultDTO)
  async batchApproveReviewItems(
    @Args('reconciliationId', { type: () => UUIDScalarType })
    reconciliationId: string,
    @Args('minConfidence', { type: () => Float, nullable: true })
    minConfidence: number | undefined,
    @Args('reviewItemIds', { type: () => [UUIDScalarType], nullable: true })
    reviewItemIds: string[] | undefined,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId({ allowUndefined: true })
    userWorkspaceId: string | undefined,
    @AuthWorkspaceMemberId() workspaceMemberId: string | undefined,
  ): Promise<StartReconciliationResultDTO> {
    const result = await this.reviewItemService.batchApprove(
      workspace.id,
      reconciliationId,
      { minConfidence, reviewItemIds },
      { userWorkspaceId, workspaceMemberId },
    );

    return {
      success: true,
      reconciliationId,
      status: `APPROVED_${result.updatedCount}`,
    };
  }

  @Mutation(() => StartReconciliationResultDTO)
  async batchApplyReviewItems(
    @Args('reconciliationId', { type: () => UUIDScalarType })
    reconciliationId: string,
    @Args('action', { type: () => String })
    action: string,
    @Args('minConfidence', { type: () => Float, nullable: true })
    minConfidence: number | undefined,
    @Args('reviewItemIds', { type: () => [UUIDScalarType], nullable: true })
    reviewItemIds: string[] | undefined,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUserWorkspaceId({ allowUndefined: true })
    userWorkspaceId: string | undefined,
    @AuthWorkspaceMemberId() workspaceMemberId: string | undefined,
  ): Promise<StartReconciliationResultDTO> {
    const normalizedAction = action.toUpperCase();

    if (normalizedAction !== 'APPLY' && normalizedAction !== 'UNDO') {
      throw new BadRequestException(
        `Unsupported batch review item action: ${action}`,
      );
    }

    const result = await this.reviewItemService.batchApply(
      workspace.id,
      reconciliationId,
      normalizedAction,
      { minConfidence, reviewItemIds },
      {
        userWorkspaceId,
        workspaceMemberId,
      },
    );

    return {
      success: true,
      reconciliationId,
      status:
        normalizedAction === 'APPLY'
          ? `APPLIED_${result.updatedCount}`
          : `UNDONE_${result.updatedCount}`,
    };
  }
}
