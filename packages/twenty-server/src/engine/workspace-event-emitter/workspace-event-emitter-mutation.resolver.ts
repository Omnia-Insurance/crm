import { UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation } from '@nestjs/graphql';

import { isDefined } from 'twenty-shared/utils';

import { type ApiKeyEntity } from 'src/engine/core-modules/api-key/api-key.entity';
import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { PreventNestToAutoLogGraphqlErrorsFilter } from 'src/engine/core-modules/graphql/filters/prevent-nest-to-auto-log-graphql-errors.filter';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthApiKey } from 'src/engine/decorators/auth/auth-api-key.decorator';
import { AuthUserWorkspaceId } from 'src/engine/decorators/auth/auth-user-workspace-id.decorator';
import { AuthUser } from 'src/engine/decorators/auth/auth-user.decorator';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { UserAuthGuard } from 'src/engine/guards/user-auth.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { AddQuerySubscriptionInput } from 'src/engine/subscriptions/dtos/add-query-subscription.input';
import { RemoveQueryFromEventStreamInput } from 'src/engine/subscriptions/dtos/remove-query-subscription.input';
import {
  EventStreamException,
  EventStreamExceptionCode,
} from 'src/engine/subscriptions/event-stream.exception';
import { EventStreamService } from 'src/engine/subscriptions/event-stream.service';
import { WorkspaceEventEmitterExceptionFilter } from 'src/engine/workspace-event-emitter/workspace-event-emitter-exception.filter';

import { eventStreamIdToChannelId } from './utils/get-channel-id-from-event-stream-id';

@MetadataResolver()
@UseGuards(WorkspaceAuthGuard, UserAuthGuard, NoPermissionGuard)
@UsePipes(ResolverValidationPipe)
@UseFilters(
  WorkspaceEventEmitterExceptionFilter,
  PreventNestToAutoLogGraphqlErrorsFilter,
)
export class WorkspaceEventEmitterMutationResolver {
  constructor(
    private readonly eventStreamService: EventStreamService,
  ) {}

  @Mutation(() => Boolean)
  async addQueryToEventStream(
    @Args('input') input: AddQuerySubscriptionInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUser({ allowUndefined: true }) user: UserEntity | undefined,
    @AuthUserWorkspaceId() userWorkspaceId: string | undefined,
    @AuthApiKey() apiKey: ApiKeyEntity | undefined,
  ): Promise<boolean> {
    const eventStreamChannelId = eventStreamIdToChannelId(input.eventStreamId);
    const streamData = await this.eventStreamService.getStreamData(
      workspace.id,
      eventStreamChannelId,
    );

    if (!isDefined(streamData)) {
      throw new EventStreamException(
        'Event stream does not exist',
        EventStreamExceptionCode.EVENT_STREAM_DOES_NOT_EXIST,
      );
    }
    const isAuthorized = await this.eventStreamService.isAuthorized({
      streamData,
      authContext: {
        userWorkspaceId,
        apiKeyId: apiKey?.id,
      },
    });

    if (!isAuthorized) {
      throw new EventStreamException(
        'You are not authorized to add a query to this event stream',
        EventStreamExceptionCode.NOT_AUTHORIZED,
      );
    }
    await this.eventStreamService.addQuery({
      workspaceId: workspace.id,
      eventStreamChannelId,
      queryId: input.queryId,
      operationSignature: input.operationSignature,
    });

    return true;
  }

  @Mutation(() => Boolean)
  async removeQueryFromEventStream(
    @Args('input') input: RemoveQueryFromEventStreamInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
    @AuthUser({ allowUndefined: true }) user: UserEntity | undefined,
    @AuthUserWorkspaceId() userWorkspaceId: string | undefined,
    @AuthApiKey() apiKey: ApiKeyEntity | undefined,
  ): Promise<boolean> {
    const eventStreamChannelId = eventStreamIdToChannelId(input.eventStreamId);

    const streamData = await this.eventStreamService.getStreamData(
      workspace.id,
      eventStreamChannelId,
    );

    if (!isDefined(streamData)) {
      throw new EventStreamException(
        'Event stream does not exist',
        EventStreamExceptionCode.EVENT_STREAM_DOES_NOT_EXIST,
      );
    }

    const isAuthorized = await this.eventStreamService.isAuthorized({
      streamData,
      authContext: {
        userWorkspaceId,
        apiKeyId: apiKey?.id,
      },
    });

    if (!isAuthorized) {
      throw new EventStreamException(
        'You are not authorized to remove a query from this event stream',
        EventStreamExceptionCode.NOT_AUTHORIZED,
      );
    }

    await this.eventStreamService.removeQuery({
      workspaceId: workspace.id,
      eventStreamChannelId,
      queryId: input.queryId,
    });

    return true;
  }
}
