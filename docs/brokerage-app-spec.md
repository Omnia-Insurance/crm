# Brokerage App Spec

`Brokerage` is the barebones insurance brokerage CRM app. It owns the
foundational model needed to run a Twenty workspace as an insurance brokerage:
agents, leads, policies, calls, carriers, products, and lead sources.

Provider ingestion, call compliance, reconciliation, and time tracking are out
of scope for this app. Those should be separate apps that depend on Brokerage.

## Goals

- Provide a clean insurance brokerage data model for new workspaces.
- Adopt Omnia's existing brokerage metadata without recreating tables or moving
  records.
- Keep provider-specific fields out of the core model.
- Install sensible user-facing roles for agents and managers.
- Preserve the standard Twenty objects that should remain standard objects,
  especially `person`, `task`, `note`, and workflow objects.

## App Boundaries

Included:

- Agent
- Call
- Carrier
- Carrier Product
- Product Type
- Product
- Lead
- Family Member
- Policy
- Lead Source
- Brokerage navigation, Today/MTD views, and record page field layouts
- Brokerage post-install view sort normalization for default workspace views,
  with locked view permission failures skipped instead of blocking install
- Brokerage user-facing roles

Excluded:

- Convoso, HealthSherpa, or any provider-specific ingestion setup
- `convosoCallId`, `convosoLeadId`, `convosoUserId`, `convosoListId`
- Payment reconciliation objects: `reconciliation`, `carrierConfig`,
  `reviewItem`
- Compliance QA objects: `qaScorecard`, `qaManager`
- Time card/payroll tracking
- Legacy import identifiers such as `oldCrmPolicyId`

## Object Model

### Agent

Internal object name should remain `agentProfile` for compatibility with the
existing Omnia workspace. Label it as `Agent`.

Fields:

- `name`: text
- `email`: emails
- `npn`: text
- `status`: select
- `workspaceMember`: many-to-one `workspaceMember`, nullable

Status options:

- `ACTIVE`
- `TERMINATED`
- `PENDING`
- `ICANN`

Notes:

- Agents can exist without a workspace member because historical/inactive
  agents must remain in the CRM.
- Sales manager, QA manager, and provider IDs are not part of Brokerage v1.

### Call

Fields:

- `name`: text
- `direction`: select
- `duration`: number, same structure as current Omnia `duration`
- `callDate`: date-time
- `cost`: currency
- `billable`: boolean
- `status`: text
- `statusName`: text
- `queueName`: text
- `recording`: links, displayed as audio where supported
- `agent`: many-to-one Agent
- `lead`: many-to-one Lead
- `leadSource`: many-to-one Lead Source

Direction options:

- `INBOUND`
- `OUTBOUND`

Excluded provider fields:

- `convosoCallId`
- `convosoLeadId`

### Carrier

Fields:

- `name`: text
- `active`: boolean
- `carrierProducts`: one-to-many Carrier Product

### Product Type

Fields:

- `name`: text
- `products`: one-to-many Product

### Product

Fields:

- `name`: text
- `active`: boolean
- `productType`: many-to-one Product Type
- `policies`: one-to-many Policy
- `carrierProducts`: one-to-many Carrier Product

### Carrier Product

Fields:

- `name`: text
- `commission`: currency
- `active`: boolean
- `statesAvailable`: multi-select
- `carrier`: many-to-one Carrier
- `product`: many-to-one Product

### Lead

Use standard `person` as the Lead object instead of creating a separate custom
object. The Brokerage app should add/own the insurance-specific fields and
views needed to treat people as leads.

Fields:

- `name`: full name
- `emails`: emails
- `phones`: phones
- `dateOfBirth`: date
- `gender`: select
- `leadStatus`: select
- `leadSource`: many-to-one Lead Source
- `assignedAgent`: many-to-one Agent
- `policies`: one-to-many Policy
- `familyMembers`: one-to-many Family Member
- `address`: address
- `doNotCall`: boolean
- `doNotEmail`: boolean
- `calls`: one-to-many Call

Excluded provider fields:

- external `leadId`

### Family Member

Fields:

- `name`: text
- `dateOfBirth`: date
- `memberType`: select
- `lead`: many-to-one Lead

### Policy

Fields:

- `name`: text, derived from carrier/product unless later changed
- `premium`: currency
- `effectiveDate`: date
- `expirationDate`: date
- `status`: select
- `lead`: many-to-one Lead
- `carrier`: many-to-one Carrier
- `product`: many-to-one Product
- `agent`: many-to-one Agent
- `submittedDate`: date-time
- `applicationId`: text
- `policyNumber`: text
- `ltv`: currency
- `applicantCount`: number
- `paidThroughDate`: date

Excluded fields:

- `oldCrmPolicyId`
- `reviewItems`
- reconciliation-specific fields
- provider-specific ingestion identifiers

### Lead Source

Fields:

- `name`: text
- `active`: boolean
- `leads`: one-to-many Lead
- `costPerCall`: currency
- `minimumCallDuration`: number
- `calls`: one-to-many Call

Excluded provider fields:

- `queueKey`
- `convosoListId`

## Roles

Brokerage should install user-facing roles in addition to its required app
default function role.

### App Default Function Role

Purpose:

- Required by the app package system.
- Not assignable to users, agents, or API keys.
- Should have no broad access unless Brokerage later adds logic functions.

### Agent Role

Purpose:

- Equivalent to Omnia's current `Member` role.
- Assignable to workspace users.

Recommended permissions:

- Read: Leads, Policies, Calls, Agents, Carriers, Products, Product Types,
  Carrier Products, Lead Sources, Family Members.
- Update: Leads, Policies, Family Members.
- Delete/destroy: disabled by default.
- Sidebar: show Leads and Policies by default; Calls can be shown if the
  brokerage wants agents reviewing calls directly.

Required row-level behavior:

- Policy write scope should be limited to policies where `policy.agent` resolves
  to the current user's Agent record through `agent.workspaceMember`.
- The existing 15-minute policy edit window should continue to be enforced by
  platform permission logic.
- Reads are intentionally shared for v1; agents should not be limited to only
  records tied to their own Agent record.

Implementation note:

- Current app role manifests support broad role flags plus object/field
  permissions. They do not model row-level predicates or scoped write-only RLS.
  Agent policy-write ownership and edit-window enforcement therefore need a
  Brokerage post-install/adoption step or an app manifest extension before this
  can be fully bolt-on.

### Manager Role

Purpose:

- Assignable to workspace users who manage brokerage operations.

Recommended permissions:

- Read/update: all Brokerage objects.
- Soft delete: optional; disabled for v1 unless business owners want managers
  cleaning records.
- Destroy: disabled.
- Sidebar: show Brokerage objects.
- Settings/admin access: disabled. Admin remains the standard Twenty admin role.

RLS:

- No row-level restrictions for v1.

## Navigation

Brokerage should install a curated navigation section roughly matching the
current Omnia operational order:

- Dashboards
- Leads
- Policies
- Calls
- Lead Sources
- Agents
- Carriers folder
- Carrier
- Product
- Product Type
- Carrier Product
- Tasks
- Workflows

Compliance should remain a separate `Quality Assurance` section owned by the
Compliance app.

## Existing Omnia Migration Strategy

Do not install Brokerage into Omnia by creating duplicate objects.

Safe path:

1. Build the Brokerage app with stable universal identifiers for all objects,
   fields, relations, app-owned Today/MTD views, roles, and navigation.
2. Create an adoption migration that maps Omnia's existing workspace-custom
   object/field metadata to those Brokerage universal identifiers and
   `applicationId`s.
3. Preserve object IDs, field IDs, relation IDs, table names, views, record page
   layouts, records, notes, tasks, attachments, and timeline targets.
4. Remove or leave provider-specific fields to their owning provider apps only
   after dependent ingestion code is ready.
5. Repoint Compliance relations from workspace-custom Brokerage objects to
   app-owned Brokerage universal identifiers.

Risks:

- Duplicate object names if app install creates instead of adopts.
- Existing GraphQL names and relation field IDs are depended on by Compliance,
  tasks, notes, exports, and ingestion.
- Agent policy-write ownership and the policy edit window need permission
  adoption, not just new role creation.
- Current server query hooks for lead, call, and policy still live in platform
  code and must keep working against the adopted app-owned objects.

Current implementation:

- `workspace:adopt-brokerage-app` is the metadata-only adoption command for
  existing Omnia workspaces.
- The command requires the Brokerage app to be installed first, supports
  `--dry-run`, updates matching object/field/navigation metadata ownership, and
  refreshes workspace metadata caches.
- It intentionally does not delete provider-specific fields; those remain
  workspace-custom until provider ingestion moves to separate apps.

## Implementation Phases

1. Scaffold `packages/twenty-apps/internal/brokerage`.
2. Define Brokerage objects, fields, relations, views, navigation, and rich app
   About content.
3. Define the default app function role plus Agent and Manager role manifests.
4. Add post-install/adoption logic for Agent policy-write ownership and the
   policy edit window if app manifests cannot express them directly.
5. Build local empty-workspace install tests.
6. Build Omnia metadata adoption migration and dry-run metadata diff tooling.
7. Install/adopt in staging, then production with database backup and rollback
   plan.
