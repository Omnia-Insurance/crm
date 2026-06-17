// OMNIA-CUSTOM: Metadata GraphQL mutations for CRM-owned Telephony runtime.

import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation } from '@nestjs/graphql';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspaceMemberId } from 'src/engine/decorators/auth/auth-workspace-member-id.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { TelephonyCallSessionDTO } from 'src/modules/telephony/dtos/telephony-call-session.dto';
import { TelephonyNextCampaignLeadDTO } from 'src/modules/telephony/dtos/telephony-next-campaign-lead.dto';
import { TelephonySessionDTO } from 'src/modules/telephony/dtos/telephony-session.dto';
import { TelephonyService } from 'src/modules/telephony/services/telephony.service';

@MetadataResolver()
@UsePipes(ResolverValidationPipe)
@UseFilters(AuthGraphqlApiExceptionFilter)
@UseGuards(WorkspaceAuthGuard, NoPermissionGuard)
export class TelephonyResolver {
  constructor(private readonly telephonyService: TelephonyService) {}

  @Mutation(() => TelephonySessionDTO)
  async startTelephonySession(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<TelephonySessionDTO> {
    return this.telephonyService.startTelephonySession({
      workspace,
      workspaceMemberId,
    });
  }

  @Mutation(() => TelephonySessionDTO)
  async setAgentTelephonyStatus(
    @Args('status', { type: () => String }) status: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<TelephonySessionDTO> {
    return this.telephonyService.setAgentTelephonyStatus({
      workspace,
      workspaceMemberId,
      status,
    });
  }

  @Mutation(() => Boolean)
  async endTelephonySession(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<boolean> {
    return this.telephonyService.endTelephonySession({
      workspace,
      workspaceMemberId,
    });
  }

  @Mutation(() => TelephonyNextCampaignLeadDTO, { nullable: true })
  async requestNextCampaignLead(
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<TelephonyNextCampaignLeadDTO | null> {
    return this.telephonyService.requestNextCampaignLead({
      workspace,
      workspaceMemberId,
    });
  }

  @Mutation(() => Boolean)
  async releaseCampaignLead(
    @Args('reason', { type: () => String }) reason: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<boolean> {
    return this.telephonyService.releaseCampaignLead({
      workspace,
      workspaceMemberId,
      reason,
    });
  }

  @Mutation(() => TelephonyCallSessionDTO)
  async startOutboundCall(
    @Args('campaignLeadId', { type: () => String }) campaignLeadId: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthWorkspaceMemberId() workspaceMemberId: string,
  ): Promise<TelephonyCallSessionDTO> {
    return this.telephonyService.startOutboundCall({
      workspace,
      workspaceMemberId,
      campaignLeadId,
    });
  }

  @Mutation(() => TelephonyCallSessionDTO)
  async submitCallDisposition(
    @Args('callSessionId', { type: () => String }) callSessionId: string,
    @Args('dispositionId', { type: () => String }) dispositionId: string,
    @Args('notes', { type: () => String, nullable: true })
    notes: string | null | undefined,
    @Args('callbackAt', { type: () => String, nullable: true })
    callbackAt: string | null | undefined,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<TelephonyCallSessionDTO> {
    return this.telephonyService.submitCallDisposition({
      workspace,
      callSessionId,
      dispositionId,
      notes,
      callbackAt,
    });
  }

  @Mutation(() => Boolean)
  async transferOrEndInboundCall(
    @Args('callSessionId', { type: () => String }) callSessionId: string,
    @Args('action', { type: () => String }) action: string,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<boolean> {
    return this.telephonyService.transferOrEndInboundCall({
      workspace,
      callSessionId,
      action,
    });
  }
}
