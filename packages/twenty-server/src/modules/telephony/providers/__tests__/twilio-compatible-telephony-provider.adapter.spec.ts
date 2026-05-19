import { TwilioCompatibleTelephonyProviderAdapter } from 'src/modules/telephony/providers/twilio-compatible-telephony-provider.adapter';

describe('TwilioCompatibleTelephonyProviderAdapter', () => {
  const adapter = new TwilioCompatibleTelephonyProviderAdapter();

  it('normalizes ringing call lifecycle payloads', () => {
    const event = adapter.normalizeWebhookEvent({
      CallSid: 'CA123',
      CallStatus: 'ringing',
      From: '+13135550100',
      To: '+13135550101',
      Timestamp: '2026-05-19T15:00:00.000Z',
    });

    expect(event).toMatchObject({
      eventType: 'RINGING',
      callSessionStatus: 'RINGING',
      provider: 'twilio-compatible',
      providerCallId: 'CA123',
      fromNumber: '+13135550100',
      toNumber: '+13135550101',
    });
    expect(event.eventTime.toISOString()).toBe('2026-05-19T15:00:00.000Z');
  });

  it('normalizes recording callbacks as recording-ready events', () => {
    const event = adapter.normalizeWebhookEvent({
      CallSid: 'CA123',
      RecordingSid: 'RE123',
      RecordingUrl: 'https://recordings.example/RE123',
      RecordingStatus: 'completed',
    });

    expect(event).toMatchObject({
      eventType: 'RECORDING_READY',
      providerCallId: 'CA123',
      providerRecordingId: 'RE123',
      recordingUrl: 'https://recordings.example/RE123',
      recordingStatus: 'completed',
    });
    expect(event.callSessionStatus).toBeUndefined();
  });

  it('validates optional shared-secret webhook headers', () => {
    expect(
      adapter.validateWebhook({
        headers: { 'x-telephony-webhook-secret': 'secret' },
        payload: {},
        webhookSecret: 'secret',
      }),
    ).toBe(true);

    expect(
      adapter.validateWebhook({
        headers: { 'x-telephony-webhook-secret': 'wrong' },
        payload: {},
        webhookSecret: 'secret',
      }),
    ).toBe(false);
  });
});
