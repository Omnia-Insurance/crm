import { Module } from '@nestjs/common';

import { AgentProfileModule } from 'src/modules/agent-profile/agent-profile.module';
import { PolicyCreateManyPostQueryHook } from 'src/modules/policy/query-hooks/policy-create-many.post-query.hook';
import { PolicyCreateOnePostQueryHook } from 'src/modules/policy/query-hooks/policy-create-one.post-query.hook';

@Module({
  imports: [AgentProfileModule],
  providers: [PolicyCreateOnePostQueryHook, PolicyCreateManyPostQueryHook],
})
export class PolicyQueryHookModule {}
