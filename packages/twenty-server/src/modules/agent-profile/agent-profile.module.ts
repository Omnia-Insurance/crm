import { Module } from '@nestjs/common';

import { WorkspaceCacheModule } from 'src/engine/workspace-cache/workspace-cache.module';
import { AgentProfileAssignmentService } from 'src/modules/agent-profile/services/agent-profile-assignment.service';
import { AgentProfileResolverService } from 'src/modules/agent-profile/services/agent-profile-resolver.service';

@Module({
  imports: [WorkspaceCacheModule],
  providers: [AgentProfileResolverService, AgentProfileAssignmentService],
  exports: [AgentProfileResolverService, AgentProfileAssignmentService],
})
export class AgentProfileModule {}
