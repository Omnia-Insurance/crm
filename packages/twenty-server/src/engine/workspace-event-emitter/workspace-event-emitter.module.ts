import { Global, Module } from '@nestjs/common';

import { SubscriptionsModule } from 'src/engine/subscriptions/subscriptions.module';
import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';
import { WorkspaceEventEmitter } from 'src/engine/workspace-event-emitter/workspace-event-emitter';
import { WorkspaceEventEmitterMutationResolver } from 'src/engine/workspace-event-emitter/workspace-event-emitter-mutation.resolver';
import { WorkspaceEventEmitterResolver } from 'src/engine/workspace-event-emitter/workspace-event-emitter.resolver';
import { WorkspaceEventEmitterService } from 'src/engine/workspace-event-emitter/workspace-event-emitter.service';

@Global()
@Module({
  imports: [SubscriptionsModule, WorkspaceCacheModule],
  providers: [
    WorkspaceEventEmitter,
    WorkspaceEventEmitterService,
    WorkspaceEventEmitterResolver,
    WorkspaceEventEmitterMutationResolver,
  ],
  exports: [WorkspaceEventEmitter, WorkspaceEventEmitterService],
})
export class WorkspaceEventEmitterModule {}
