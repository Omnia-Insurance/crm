import { Module } from '@nestjs/common';

import { GlobalWorkspaceDataSourceModule } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-datasource.module';
import { AgentProfileModule } from 'src/modules/agent-profile/agent-profile.module';
import { TelephonyProviderWebhookController } from 'src/modules/telephony/controllers/telephony-provider-webhook.controller';
import { TwilioCompatibleTelephonyProviderAdapter } from 'src/modules/telephony/providers/twilio-compatible-telephony-provider.adapter';
import { TelephonyProviderRegistryService } from 'src/modules/telephony/services/telephony-provider-registry.service';
import { TelephonyService } from 'src/modules/telephony/services/telephony.service';
import { TelephonyResolver } from 'src/modules/telephony/telephony.resolver';

// OMNIA-CUSTOM: CRM-owned telephony runtime. Workspace object metadata lives
// in packages/twenty-apps/internal/telephony; this module coordinates sessions,
// routing leases, provider webhooks, and call disposition transitions.
@Module({
  imports: [GlobalWorkspaceDataSourceModule, AgentProfileModule],
  controllers: [TelephonyProviderWebhookController],
  providers: [
    TelephonyResolver,
    TelephonyService,
    TelephonyProviderRegistryService,
    TwilioCompatibleTelephonyProviderAdapter,
  ],
  exports: [TelephonyService],
})
export class TelephonyModule {}
