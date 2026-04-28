// OMNIA-CUSTOM: GraphQL resolver for reconciliation pipeline operations.
// Exposes mutations to trigger parsing and matching from the frontend.

import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, Float, Mutation } from '@nestjs/graphql';

import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
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
    await this.orchestratorService.startParsing(
      workspace.id,
      reconciliationId,
    );

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
  async startReconciliationApply(
    @Args('reconciliationId', { type: () => UUIDScalarType })
    reconciliationId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<StartReconciliationResultDTO> {
    await this.orchestratorService.startApplying(
      workspace.id,
      reconciliationId,
    );

    return {
      success: true,
      reconciliationId,
      status: 'COMPLETED',
    };
  }

  @Mutation(() => StartReconciliationResultDTO)
  async startCommissionParsing(
    @Args('statementId', { type: () => UUIDScalarType })
    statementId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<StartReconciliationResultDTO> {
    await this.orchestratorService.startCommissionParsing(
      workspace.id,
      statementId,
    );

    return {
      success: true,
      reconciliationId: statementId,
      status: 'PARSING',
    };
  }

  @Mutation(() => StartReconciliationResultDTO)
  async batchApproveReviewItems(
    @Args('reconciliationId', { type: () => UUIDScalarType })
    reconciliationId: string,
    @Args('minConfidence', { type: () => Float, nullable: true })
    minConfidence: number | undefined,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<StartReconciliationResultDTO> {
    const result = await this.reviewItemService.batchApprove(
      workspace.id,
      reconciliationId,
      { minConfidence },
    );

    return {
      success: true,
      reconciliationId,
      status: `APPROVED_${result.updatedCount}`,
    };
  }
}
