import { Module } from '@nestjs/common';

import { AgentProfileModule } from 'src/modules/agent-profile/agent-profile.module';
import { CallCreateManyPreQueryHook } from 'src/modules/call/query-hooks/call-create-many.pre-query.hook';
import { CallCreateOnePreQueryHook } from 'src/modules/call/query-hooks/call-create-one.pre-query.hook';

@Module({
  imports: [AgentProfileModule],
  providers: [CallCreateOnePreQueryHook, CallCreateManyPreQueryHook],
})
export class CallQueryHookModule {}
