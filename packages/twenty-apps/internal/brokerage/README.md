# Brokerage

Barebones insurance brokerage CRM data model for Twenty workspaces.

Brokerage owns the foundational objects needed to run an insurance brokerage:
Agents, Leads, Policies, Calls, Carriers, Products, Carrier Products, Product
Types, Family Members, and Lead Sources.

Provider ingestion, payment reconciliation, compliance QA, and time tracking are
separate apps that should depend on this model instead of being bundled into
the brokerage foundation.

## Included

- Agent profiles linked optionally to workspace members
- Lead fields on the standard Person object
- Policies linked to leads, agents, carriers, and products
- Calls linked to leads, agents, and lead sources
- Carrier/product catalog objects
- Lead sources and family members
- Agent and Manager role definitions
- Brokerage sidebar navigation
- Today/MTD views plus post-install sorting for default workspace views. Locked
  views are skipped if the install context cannot modify them.
- Required Lead entry fields for name, address, email, phone, and date of birth
- Lead status automation that sets Status to Assigned when an assigned Agent is
  present and the Lead is still idle

## Excluded

- Provider-specific fields such as Convoso IDs
- Reconciliation objects and carrier config
- Compliance QA scorecards and managers
- Time card/payroll tracking
- Legacy import IDs

## Production Migration

Do not install this app into Omnia by creating duplicate objects. Omnia already
has production data behind workspace-custom versions of these objects. The safe
production path is an adoption migration that preserves existing object IDs,
field IDs, relation IDs, table names, record IDs, notes, tasks, files, views,
and timeline activity while assigning the metadata to this application.

After installing the app, run the server-side adoption command in dry-run mode
first:

```bash
npx nx command twenty-server -- workspace:adopt-brokerage-app --workspace-id <workspace-id> --dry-run
```

Only apply it after the dry-run reports the expected metadata-only object,
field, and navigation ownership changes.
