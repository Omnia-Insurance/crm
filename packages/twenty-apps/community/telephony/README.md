# Telephony

Calls, SMS, voicemail and recording inside Twenty, with pluggable provider
routing across Twilio, Vonage and others.

## Status

Scaffold only. Implemented so far:

- Application config + workspace `applicationVariables` for Twilio, Vonage,
  router policy and feature toggles
- Provider-agnostic `TelephonyAdapter` interface and normalized event shape
- `ProviderRouter` with weighted / priority / cost policies and per-provider
  circuit breakers
- Twilio adapter: webhook parsing + signature verification + health probe
  (REST call methods are stubs)
- `Call` workspace object

Not yet implemented (next passes):

- `SmsMessage`, `PhoneNumber`, `PhoneAssignment`, `TelephonyProviderHealth`
  workspace objects
- Logic functions: `twilio-webhook`, `initiate-call`, `send-sms`,
  `generate-access-token`, `twiml-app`
- React softphone widget + click-to-call cell action
- Settings page tab for provider weights and number assignment
- Vonage / RingCentral / Aircall adapters

## Architecture

```
                  ┌─────────────────────────────────────┐
                  │   Logic functions / BullMQ jobs     │
                  └──────────────┬──────────────────────┘
                                 │ outbound
                                 ▼
              ┌──────────────────────────────────────────┐
              │            ProviderRouter                │
              │  policy │ weights │ circuit breakers     │
              └──────────────┬───────────────────────────┘
                 ┌───────────┼────────────┐
                 ▼           ▼            ▼
            ┌────────┐  ┌────────┐   ┌────────┐
            │ Twilio │  │ Vonage │ … │ Aircall│       ◀── outbound only
            │adapter │  │adapter │   │adapter │
            └───┬────┘  └────────┘   └────────┘
                │
       inbound  │ webhooks pinned to the provider
                ▼      that owns the dialed number
        normalized TelephonyEvent → upsert Call / SmsMessage
```

Inbound is single-provider per number — the router doesn't get to choose
because the carrier already did. Mobile-forward is the failover lever.
