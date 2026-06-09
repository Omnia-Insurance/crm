// OMNIA-CUSTOM: GraphQL resolver for reconciliation pipeline operations.
// Exposes mutations to trigger parsing and matching from the frontend.

import {
  BadRequestException,
  UseFilters,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { Args, Float, Mutation } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { StartReconciliationResultDTO } from 'src/modules/reconciliation/dtos/start-reconciliation.dto';
import { ReconciliationOrchestratorService } from 'src/modules/reconciliation/orchestrator.service';
import { ReviewItemService } from 'src/modules/reconciliation/services/review-item.service';

@MetadataResolver()
@UsePipes(ResolverValidationPipe)
@UseFilters(AuthGraphqlApiExceptionFilter)
@UseGuards(WorkspaceAuthGuard, NoPermissionGuard)
export class ReconciliationResolver {
  constructor(
    private readonly orchestratorService: ReconciliationOrchestratorService,
    private readonly reviewItemService: ReviewItemService,
  ) {}

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
  ): Promise<StartReconciliationResultDTO> {
    const result = await this.reviewItemService.batchApprove(
      workspace.id,
      reconciliationId,
      { minConfidence, reviewItemIds },
      { userWorkspaceId },
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
