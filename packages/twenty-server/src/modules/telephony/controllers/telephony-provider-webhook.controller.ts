// OMNIA-CUSTOM: Public webhook ingress for Telephony CPaaS provider events.

import {
  Controller,
  HttpCode,
  Param,
  Post,
  type RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';

import { type Request } from 'express';

import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { PublicEndpointGuard } from 'src/engine/guards/public-endpoint.guard';
import { TelephonyService } from 'src/modules/telephony/services/telephony.service';

const isPayloadRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

@Controller('webhooks/telephony')
export class TelephonyProviderWebhookController {
  constructor(private readonly telephonyService: TelephonyService) {}

  @Post(':workspaceId/:provider')
  @UseGuards(PublicEndpointGuard, NoPermissionGuard)
  @HttpCode(200)
  async handleProviderWebhook(
    @Param('workspaceId') workspaceId: string,
    @Param('provider') provider: string,
    @Req() request: RawBodyRequest<Request>,
  ): Promise<{ success: boolean; eventType: string }> {
    const requestBody: unknown = request.body;

    return this.telephonyService.handleProviderWebhook({
      workspaceId,
      provider,
      headers: request.headers,
      payload: isPayloadRecord(requestBody) ? requestBody : {},
      rawBody: request.rawBody,
    });
  }
}
