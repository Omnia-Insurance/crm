import {
  BadRequestException,
  UseFilters,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { Args, Float, Mutation, Query } from '@nestjs/graphql';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { getWorkspaceAuthContext } from 'src/engine/core-modules/auth/storage/workspace-auth-context.storage';
import { type UserWorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { AuthenticationError } from 'src/engine/core-modules/graphql/utils/graphql-errors.util';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AccessPolicyGuard } from 'src/engine/guards/access-policy.guard';
import { PermissionsGraphqlApiExceptionFilter } from 'src/engine/permissions/utils/permissions-graphql-api-exception.filter';
import { RECONCILIATION_ACCESS_POLICY } from 'src/modules/reconciliation/constants/reconciliation-access-policy.constant';
import { StartReconciliationResultDTO } from 'src/modules/reconciliation/dtos/start-reconciliation.dto';
import { ValidateCarrierConfigResultDTO } from 'src/modules/reconciliation/dtos/validate-carrier-config.dto';
import { ReconciliationOrchestratorService } from 'src/modules/reconciliation/orchestrator.service';
import { CarrierConfigValidationService } from 'src/modules/reconciliation/services/carrier-config-validation.service';
import { ReviewItemService } from 'src/modules/reconciliation/services/review-item.service';

@MetadataResolver()
@UsePipes(ResolverValidationPipe)
@UseFilters(PermissionsGraphqlApiExceptionFilter, AuthGraphqlApiExceptionFilter)
@UseGuards(AccessPolicyGuard(RECONCILIATION_ACCESS_POLICY))
export class ReconciliationResolver {
  constructor(
    private readonly orchestratorService: ReconciliationOrchestratorService,
    private readonly reviewItemService: ReviewItemService,
    private readonly carrierConfigValidationService: CarrierConfigValidationService,
  ) {}

  // Pre-run check of the full parse/match fail-fast chain (OMN-11) without enqueuing
  // anything; config problems come back in `errors`, never as a thrown GraphQL error
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

  // Also legal from REVIEW (OMN-11) so parse-time config edits re-apply to the pinned
  // file; the CAS transition serializes restarts and the re-match keeps decided items
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
  ): Promise<StartReconciliationResultDTO> {
    const authContext = this.getUserAuthContextOrThrow();

    const result = await this.reviewItemService.batchApprove(
      authContext.workspace.id,
      reconciliationId,
      { minConfidence, reviewItemIds },
      { authContext },
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
  ): Promise<StartReconciliationResultDTO> {
    const authContext = this.getUserAuthContextOrThrow();
    const normalizedAction = action.toUpperCase();

    if (normalizedAction !== 'APPLY' && normalizedAction !== 'UNDO') {
      throw new BadRequestException(
        `Unsupported batch review item action: ${action}`,
      );
    }

    const result = await this.reviewItemService.batchApply(
      authContext.workspace.id,
      reconciliationId,
      normalizedAction,
      { minConfidence, reviewItemIds },
      { authContext },
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

  // Batch writes are authorized against the acting member, so a user context is required
  private getUserAuthContextOrThrow(): UserWorkspaceAuthContext {
    const authContext = getWorkspaceAuthContext();

    if (!isUserAuthContext(authContext)) {
      throw new AuthenticationError('User authentication required');
    }

    return authContext;
  }
}
