import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import GraphQLJSON from 'graphql-type-json';
import { PermissionFlagType } from 'twenty-shared/constants';
import { isDefined } from 'twenty-shared/utils';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import {
  AppendRowsResultDTO,
  ImportJobDTO,
} from 'src/engine/core-modules/import-job/dtos/import-job.dto';
import { ImportJobService } from 'src/engine/core-modules/import-job/import-job.service';
import { fromImportJobEntityToDto } from 'src/engine/core-modules/import-job/utils/from-import-job-entity-to-dto.util';
import { type FlatWorkspace } from 'src/engine/core-modules/workspace/types/flat-workspace.type';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { AccessPolicyGuard } from 'src/engine/guards/access-policy.guard';

@MetadataResolver()
@UseGuards(
  AccessPolicyGuard({
    authPrincipals: {
      userSession: {
        standard: true,
        impersonated: true,
        playground: false,
        workspaceAgnostic: false,
      },
      apiKey: false,
      oauthClient: false,
      application: false,
    },
    requiredPermissionFlags: [PermissionFlagType.IMPORT_CSV],
  }),
)
export class ImportJobResolver {
  constructor(private readonly importJobService: ImportJobService) {}

  @Mutation(() => ImportJobDTO)
  async startImportJob(
    @Args('objectNameSingular') objectNameSingular: string,
    @Args('columnMappings', { type: () => GraphQLJSON })
    columnMappings: Record<string, unknown>,
    @Args('validatedRows', { type: () => GraphQLJSON })
    validatedRows: Record<string, unknown>[],
    @Args('fileName', { type: () => String, nullable: true })
    fileName: string | undefined,
    @AuthWorkspace() workspace: FlatWorkspace,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @AuthWorkspaceMemberId() workspaceMemberId: string | undefined,
  ): Promise<ImportJobDTO> {
    const importJob = await this.importJobService.startImportJob({
      requester: { workspaceId: workspace.id, userWorkspaceId },
      workspaceMemberId: workspaceMemberId ?? null,
      objectNameSingular,
      fileName: fileName ?? null,
      columnMappings,
      validatedRows,
    });

    return fromImportJobEntityToDto(importJob);
  }

  @Mutation(() => ImportJobDTO)
  async createImportJob(
    @Args('objectNameSingular') objectNameSingular: string,
    @Args('columnMappings', { type: () => GraphQLJSON })
    columnMappings: Record<string, unknown>,
    @Args('fileName', { type: () => String, nullable: true })
    fileName: string | undefined,
    @AuthWorkspace() workspace: FlatWorkspace,
    @AuthUserWorkspaceId() userWorkspaceId: string,
    @AuthWorkspaceMemberId() workspaceMemberId: string | undefined,
  ): Promise<ImportJobDTO> {
    const importJob = await this.importJobService.createImportJob({
      requester: { workspaceId: workspace.id, userWorkspaceId },
      workspaceMemberId: workspaceMemberId ?? null,
      objectNameSingular,
      fileName: fileName ?? null,
      columnMappings,
    });

    return fromImportJobEntityToDto(importJob);
  }

  @Mutation(() => AppendRowsResultDTO)
  async appendImportJobRows(
    @Args('importJobId') importJobId: string,
    @Args('rows', { type: () => GraphQLJSON })
    rows: Record<string, unknown>[],
    @AuthWorkspace() workspace: FlatWorkspace,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<AppendRowsResultDTO> {
    return this.importJobService.appendImportJobRows({
      requester: { workspaceId: workspace.id, userWorkspaceId },
      importJobId,
      rows,
    });
  }

  @Mutation(() => ImportJobDTO)
  async finalizeImportJob(
    @Args('importJobId') importJobId: string,
    @AuthWorkspace() workspace: FlatWorkspace,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<ImportJobDTO> {
    const importJob = await this.importJobService.finalizeImportJob({
      requester: { workspaceId: workspace.id, userWorkspaceId },
      importJobId,
    });

    return fromImportJobEntityToDto(importJob);
  }

  @Mutation(() => ImportJobDTO)
  async cancelImportJob(
    @Args('importJobId') importJobId: string,
    @AuthWorkspace() workspace: FlatWorkspace,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<ImportJobDTO> {
    const importJob = await this.importJobService.cancelImportJob({
      requester: { workspaceId: workspace.id, userWorkspaceId },
      importJobId,
    });

    return fromImportJobEntityToDto(importJob);
  }

  @Query(() => ImportJobDTO, { nullable: true })
  async importJob(
    @Args('importJobId') importJobId: string,
    @AuthWorkspace() workspace: FlatWorkspace,
    @AuthUserWorkspaceId() userWorkspaceId: string,
  ): Promise<ImportJobDTO | null> {
    const importJob = await this.importJobService.findForRequester({
      requester: { workspaceId: workspace.id, userWorkspaceId },
      importJobId,
    });

    return isDefined(importJob) ? fromImportJobEntityToDto(importJob) : null;
  }
}
