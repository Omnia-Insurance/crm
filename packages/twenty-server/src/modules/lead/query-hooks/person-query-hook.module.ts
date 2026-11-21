import { Module } from '@nestjs/common';

import { AgentProfileModule } from 'src/modules/agent-profile/agent-profile.module';
import { PersonCreateManyPreQueryHook } from 'src/modules/lead/query-hooks/person-create-many.pre-query.hook';
import { PersonCreateOnePreQueryHook } from 'src/modules/lead/query-hooks/person-create-one.pre-query.hook';

// Brokerage stores leads as person records, so lead ownership hooks key on person
@Module({
  imports: [AgentProfileModule],
  providers: [PersonCreateOnePreQueryHook, PersonCreateManyPreQueryHook],
})
export class PersonQueryHookModule {}
