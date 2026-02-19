import { Module } from '@nestjs/common';

import { AgentProfileModule } from 'src/modules/agent-profile/agent-profile.module';
import { CallCreateManyPostQueryHook } from 'src/modules/call/query-hooks/call-create-many.post-query.hook';
import { CallCreateOnePostQueryHook } from 'src/modules/call/query-hooks/call-create-one.post-query.hook';

@Module({
  imports: [AgentProfileModule],
  providers: [CallCreateOnePostQueryHook, CallCreateManyPostQueryHook],
})
export class CallQueryHookModule {}
