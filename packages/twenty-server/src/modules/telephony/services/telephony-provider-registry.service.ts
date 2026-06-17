import { Injectable } from '@nestjs/common';

import { type TelephonyProviderAdapter } from 'src/modules/telephony/providers/telephony-provider-adapter.interface';
import { TwilioCompatibleTelephonyProviderAdapter } from 'src/modules/telephony/providers/twilio-compatible-telephony-provider.adapter';

@Injectable()
export class TelephonyProviderRegistryService {
  constructor(
    private readonly twilioCompatibleTelephonyProviderAdapter: TwilioCompatibleTelephonyProviderAdapter,
  ) {}

  getAdapter(providerKey?: string | null): TelephonyProviderAdapter {
    const key =
      providerKey ?? process.env.TELEPHONY_PROVIDER ?? 'twilio-compatible';

    if (key === this.twilioCompatibleTelephonyProviderAdapter.key) {
      return this.twilioCompatibleTelephonyProviderAdapter;
    }

    return this.twilioCompatibleTelephonyProviderAdapter;
  }
}
