# Telephony

Internal CRM telephony app for campaign dialing, browser softphone workflows,
provider call sessions, dispositions, inbound queues, and audit events.

Telephony depends on the Brokerage app model. Brokerage remains the owner of
canonical Leads (`person`), final historical Calls (`call`), Agent profiles,
and Lead Sources. Telephony owns queue membership, live/provider state,
routing controls, and provider-specific identifiers.

## Included

- Campaigns with priority, status, allowed hours, recording policy, and agent
  pool rules
- Campaign Lead queue membership linked to canonical Leads
- Campaign-specific Dispositions with retry/callback behavior
- Call Sessions and immutable Call Events for provider lifecycle tracking
- Agent Presence records for durable agent state and browser session heartbeat
- Inbound Queues that map provider numbers to campaigns
- Standalone Agent Softphone page layout and navigation entry

## Runtime Contract

The server runtime in `twenty-server` owns routing locks, status mutations,
provider webhook normalization, compliance blocking, and the GraphQL mutations
used by the softphone workspace:

- `setAgentTelephonyStatus`
- `startTelephonySession`
- `endTelephonySession`
- `requestNextCampaignLead`
- `releaseCampaignLead`
- `startOutboundCall`
- `submitCallDisposition`
- `transferOrEndInboundCall`

Provider-specific IDs stay on Telephony Call Session/Event records. Final
connected calls are linked to Brokerage Calls after disposition.

## Cutover Notes

Keep Convoso ingestion readable for historical calls. New provider writes
should flow through Telephony Call Sessions and Events first, then link to the
final Brokerage Call record only after completion/disposition.
