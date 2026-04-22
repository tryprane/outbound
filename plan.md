# Deliverability MVP Plan

## Goal

Build a separate MVP that measures mailbox health, inbox placement, sender readiness, and overall outbound deliverability while using the existing outbound system at `https://prane.one` as the sending/control plane.

This MVP must:

- stay independent from the current outbound app
- connect to the current outbound app using API keys
- avoid changing any live sending behavior for existing users
- support both `Email` and `WhatsApp` sender visibility
- become the "deliverability brain" while `prane.one` remains the "sending engine"

## Product Positioning

The current outbound system is already good at:

- sending email
- sending WhatsApp
- queueing requests
- selecting pooled senders
- tracking request status

The new MVP should focus on:

- sender health
- inbox placement confidence
- seed testing
- deliverability scoring
- sender selection decisions
- pre-flight campaign safety
- API-based orchestration into the live outbound system

In short:

- `https://prane.one` = execution layer
- `Deliverability MVP` = intelligence layer

---

## Integration Boundary

The MVP will not directly send mail through SMTP, Gmail, or Zoho in v1.

Instead, it will:

1. connect to `https://prane.one` using a workspace API key
2. fetch sender availability and health summaries through new additive APIs
3. trigger test sends through existing send APIs
4. poll request status through existing request APIs
5. store its own deliverability analytics and seed placement results locally

This keeps the current product stable and live integrations safe.

---

## Existing Live API Surface

The current outbound system already exposes these live endpoints:

- `POST /api/v1/email/send`
- `POST /api/v1/whatsapp/send`
- `GET /api/v1/requests/:id`

Behavior today:

- requests are authenticated with `Authorization: Bearer <API_KEY>`
- email and WhatsApp sends are first queued
- sender selection happens later in the worker
- sender selection is currently pooled and automatic
- request status can later be checked by request id

This means the MVP can already:

- send a test email through the live system
- send a test WhatsApp through the live system
- poll the request state

What is still missing for the MVP:

- fetch active and eligible email senders
- fetch active and eligible WhatsApp senders
- optionally choose a specific sender for a send request
- fetch richer sender health summaries through API

Those should be added to the live app as additive APIs only.

---

## High-Level MVP Scope

### In Scope

- workspace connection to `https://prane.one`
- API key authentication
- sender inventory sync
- seed inbox test orchestration
- inbox placement capture
- mailbox health dashboard
- sender readiness score
- domain-level summaries
- send-policy engine
- manual and scheduled seed tests
- support for both frontend and backend

### Out of Scope for v1

- taking over actual SMTP sending
- direct mailbox credential management for live user mailboxes
- replacing the current outbound app
- modifying the current campaign engine
- changing the pooled sender logic for current clients
- complex ML models
- multi-tenant billing

---

## Core User Stories

### Deliverability Operator

- connect a workspace using `https://prane.one` and an API key
- see all active and eligible email senders
- see all active and connected WhatsApp senders
- run seed tests from a selected email sender
- observe whether the message landed in inbox, promotions, spam, or was missing
- view a mailbox health score and reasoning
- view a domain health score and reasoning
- decide whether a sender is safe for outreach

### Agency Owner

- know whether a mailbox is healthy enough to send today
- know whether Gmail placement is improving or degrading
- know which sender to prefer
- know when to pause or reduce volume

### Internal Operator

- audit every API sync and send action
- troubleshoot failed request polling
- troubleshoot missing seed placement results

---

## MVP Architecture

## System Components

1. `Frontend Web App`
- dashboard for sender health
- seed test creation
- workspace connection management
- reporting and trends

2. `Backend API`
- workspace connection CRUD
- sender sync jobs
- seed test orchestration
- sender score calculation
- classification API for seed results

3. `Worker / Scheduler`
- sync sender inventory from `prane.one`
- dispatch seed tests
- poll request status
- compute sender health snapshots
- compute domain health snapshots

4. `Database`
- stores workspaces, senders, seed accounts, tests, results, scores, sync logs

5. `Seed Inbox Observer`
- reads seed inboxes that you control
- classifies placement outcome

---

## Recommended Tech Stack

Use a stack close to the current system to keep delivery fast:

- `Next.js` for frontend and backend routes
- `PostgreSQL` for storage
- `Redis` for queueing and scheduled jobs
- `BullMQ` for background jobs
- `Prisma` for ORM
- `TypeScript` across the app

Optional later:

- `Playwright` only if you need browser-based provider checks
- `IMAP/API inbox connectors` for Gmail, Outlook, Yahoo, Zoho seed inbox observation

---

## Frontend Structure

```text
deliverability-mvp/
  apps/
    web/
      app/
        (dashboard)/
          page.tsx
          workspaces/
            page.tsx
            [id]/
              page.tsx
          senders/
            page.tsx
            email/
              page.tsx
              [id]/
                page.tsx
            whatsapp/
              page.tsx
              [id]/
                page.tsx
          seed-tests/
            page.tsx
            new/
              page.tsx
            [id]/
              page.tsx
          domains/
            page.tsx
            [domain]/
              page.tsx
          settings/
            page.tsx
        api/
          workspaces/
          senders/
          seed-tests/
          health/
      components/
        dashboard/
        workspaces/
        senders/
        seed-tests/
        domains/
        shared/
      lib/
        api/
        formatting/
        charts/
        auth/
```

## Frontend Pages

### `Dashboard`

Show:

- total connected workspaces
- total healthy mailboxes
- total at-risk mailboxes
- total eligible WhatsApp senders
- latest seed placement summary
- sender health trend widgets
- top-risk domains

### `Workspaces`

Show:

- workspace name
- base URL
- connection status
- last sync time
- API health
- sender totals

Actions:

- add workspace
- rotate API key
- trigger sync

### `Email Senders`

Show:

- sender email
- display name
- warmup status
- health score
- sync status
- daily limit
- sent today
- remaining quota
- eligible status
- eligibility reason

### `WhatsApp Senders`

Show:

- display name
- phone number
- connection status
- active status
- daily limit
- sent today
- remaining quota
- eligible status

### `Seed Tests`

Show:

- pending tests
- recent tests
- provider-wise placement
- Gmail inbox rate
- Outlook inbox rate
- spam rate

### `Sender Detail`

Show:

- health score and status
- recent seed tests
- placement timeline
- provider breakdown
- recommended safe volume
- operator notes

### `Domain Detail`

Show:

- domain score
- aggregate sender status
- placement trend
- risk reasons
- domain recommendation

---

## Backend Structure

```text
deliverability-mvp/
  apps/
    api/
      src/
        routes/
          workspaces/
          senders/
          seed-tests/
          health/
          webhooks/
        services/
          workspaceConnector/
          senderSync/
          seedTestEngine/
          seedObserver/
          scoring/
          policy/
        jobs/
          syncWorkspaceJob.ts
          dispatchSeedTestJob.ts
          pollRequestStatusJob.ts
          classifySeedPlacementJob.ts
          computeSenderHealthJob.ts
          computeDomainHealthJob.ts
        lib/
          praneOneClient.ts
          auth.ts
          logger.ts
          queue.ts
          time.ts
        db/
          prisma/
```

## Backend Modules

### `workspaceConnector`

Responsibilities:

- store workspace base URL
- store API key securely
- validate connectivity against `https://prane.one`
- manage workspace sync lifecycle

### `praneOneClient`

Responsibilities:

- encapsulate all HTTP calls to the live outbound system
- attach bearer token
- normalize response shapes
- handle retries, timeouts, and failures

### `senderSync`

Responsibilities:

- fetch email sender inventory
- fetch WhatsApp sender inventory
- calculate local remaining quota snapshots
- upsert local copies of sender data

### `seedTestEngine`

Responsibilities:

- pick senders for seed tests
- create outbound test sends through `https://prane.one`
- track remote request ids

### `seedObserver`

Responsibilities:

- inspect seed inboxes
- classify placement
- mark seed tests as completed, spam, promotions, inbox, or missing

### `scoring`

Responsibilities:

- compute mailbox health score
- compute domain health score
- compute recommended daily cap
- produce reason codes

### `policy`

Responsibilities:

- decide whether a sender is:
  - allowed
  - warned
  - blocked
  - reduced in volume

---

## Database Design for the MVP

## Core Tables

### `workspace_connections`

Fields:

- `id`
- `name`
- `baseUrl`
- `apiKeyEncrypted`
- `status`
- `lastValidatedAt`
- `lastSyncAt`
- `lastError`
- `createdAt`
- `updatedAt`

### `workspace_sync_runs`

Fields:

- `id`
- `workspaceConnectionId`
- `status`
- `startedAt`
- `finishedAt`
- `emailSenderCount`
- `whatsappSenderCount`
- `errorMessage`

### `outbound_email_senders`

Fields:

- `id`
- `workspaceConnectionId`
- `remoteSenderId`
- `email`
- `displayName`
- `providerType`
- `isActive`
- `warmupStatus`
- `mailboxHealthStatus`
- `mailboxHealthScore`
- `mailboxSyncStatus`
- `dailyLimit`
- `sentToday`
- `remainingQuota`
- `eligible`
- `eligibilityReason`
- `lastSyncedAt`

### `outbound_whatsapp_senders`

Fields:

- `id`
- `workspaceConnectionId`
- `remoteSenderId`
- `displayName`
- `phoneNumber`
- `isActive`
- `connectionStatus`
- `dailyLimit`
- `sentToday`
- `remainingQuota`
- `eligible`
- `eligibilityReason`
- `lastSyncedAt`

### `seed_accounts`

Fields:

- `id`
- `provider`
- `emailAddress`
- `inboxType`
- `isActive`
- `credentialsRef`
- `createdAt`
- `updatedAt`

Seed providers should include:

- Gmail
- Outlook
- Yahoo
- Zoho
- custom domain inbox

### `seed_tests`

Fields:

- `id`
- `workspaceConnectionId`
- `channel`
- `remoteSenderId`
- `seedAccountId`
- `requestIdFromOutbound`
- `status`
- `placement`
- `subject`
- `bodyHash`
- `sentAt`
- `observedAt`
- `errorMessage`

### `sender_health_snapshots`

Fields:

- `id`
- `workspaceConnectionId`
- `remoteSenderId`
- `channel`
- `score`
- `status`
- `recommendedDailyCap`
- `reasonsJson`
- `metricsJson`
- `createdAt`

### `domain_health_snapshots`

Fields:

- `id`
- `workspaceConnectionId`
- `domain`
- `score`
- `status`
- `reasonsJson`
- `metricsJson`
- `createdAt`

### `send_policy_decisions`

Fields:

- `id`
- `workspaceConnectionId`
- `channel`
- `remoteSenderId`
- `decision`
- `reason`
- `effectiveFrom`
- `effectiveUntil`
- `createdAt`

---

## Sender Health Model

## Email Score Inputs

Use a weighted scoring model in v1.

### Base sender readiness

- `WARMED` status
- active status
- healthy mailbox status
- sync not failing

### Capacity and usage

- daily limit
- sent today
- remaining quota

### Seed placement

- Gmail inbox %
- Gmail spam %
- Outlook inbox %
- Yahoo inbox %
- promotions %
- missing %

### Reliability

- recent failed sends
- request rejection rate

### Future additions once API exposes more data

- bounce rate
- complaint rate
- reply rate
- open rate
- unsubscribe rate

## WhatsApp Score Inputs

- active status
- connected status
- remaining quota
- session stability
- send failure ratio
- queue success rate

## Suggested Health Status Mapping

- `85-100` = `healthy`
- `70-84` = `warming`
- `50-69` = `at_risk`
- `<50` = `blocked`

## Suggested Decision Mapping

- `healthy` -> allow normal send
- `warming` -> allow low volume
- `at_risk` -> warn and reduce volume
- `blocked` -> no send

---

## Seed Testing Strategy

## Seed Network

Start with:

- `3 Gmail` seed inboxes
- `2 Outlook` seed inboxes
- `1 Yahoo` seed inbox
- `1 Zoho` seed inbox
- `1 custom domain inbox`

## Seed Test Flow

1. operator chooses one or more email senders
2. MVP creates unique seed test payloads
3. MVP sends those through `https://prane.one/api/v1/email/send`
4. MVP polls `GET /api/v1/requests/:id`
5. MVP waits for delivery confirmation
6. MVP observes seed inboxes
7. MVP records placement:
   - `inbox`
   - `promotions`
   - `spam`
   - `missing`
8. MVP recalculates sender health

## Placement Classification Rules

- mail in primary inbox = `inbox`
- mail in Gmail promotions = `promotions`
- mail in spam/junk = `spam`
- not found within SLA window = `missing`

## Initial SLA

- poll for placement up to `20-30 minutes`
- if not found, mark `missing`

---

## Communication with `https://prane.one`

## Base URL

Use:

```text
https://prane.one
```

All outbound system requests should use:

```text
Authorization: Bearer <workspace_api_key>
Content-Type: application/json
```

## Existing Endpoints Already Usable

### Email send

```http
POST https://prane.one/api/v1/email/send
```

Payload:

```json
{
  "to": "seed@gmail.com",
  "subject": "Seed test",
  "html": "<p>Hello</p>"
}
```

Response:

```json
{
  "requestId": "req_123",
  "status": "queued",
  "queuedAt": "2026-04-22T10:00:00.000Z",
  "createdAt": "2026-04-22T10:00:00.000Z"
}
```

### WhatsApp send

```http
POST https://prane.one/api/v1/whatsapp/send
```

Payload:

```json
{
  "toPhone": "+919999999999",
  "message": "Hello"
}
```

### Request status

```http
GET https://prane.one/api/v1/requests/:id
```

Current useful fields:

- `id`
- `channel`
- `status`
- `requestedTo`
- `subject`
- `errorMessage`
- `providerMessageId`
- `queuedAt`
- `processedAt`
- `selectedMailAccount`
- `selectedWhatsAppAccount`

---

## API Additions Required in the Live Outbound System

These are additive only and should not change existing send behavior.

## Read Endpoints

### `GET /api/v1/workspace/overview`

Purpose:

- fetch total sender availability for the connected workspace

Response example:

```json
{
  "email": {
    "total": 8,
    "active": 6,
    "warmed": 5,
    "eligible": 4,
    "remainingQuota": 112
  },
  "whatsapp": {
    "total": 6,
    "active": 6,
    "connected": 5,
    "eligible": 5,
    "remainingQuota": 180
  }
}
```

### `GET /api/v1/email/senders`

Purpose:

- fetch API-visible email senders

Recommended response:

```json
[
  {
    "id": "mail_123",
    "email": "sales@example.com",
    "displayName": "Sales 1",
    "type": "gmail",
    "isActive": true,
    "warmupStatus": "WARMED",
    "mailboxHealthStatus": "healthy",
    "mailboxHealthScore": 88,
    "mailboxSyncStatus": "idle",
    "dailyLimit": 40,
    "sentToday": 10,
    "remainingQuota": 30,
    "eligible": true,
    "eligibilityReason": null
  }
]
```

### `GET /api/v1/email/senders/eligible`

Purpose:

- fetch only currently eligible email senders

### `GET /api/v1/email/senders/:id`

Purpose:

- fetch detail for one sender

### `GET /api/v1/whatsapp/senders`

Purpose:

- fetch API-visible WhatsApp senders

### `GET /api/v1/whatsapp/senders/eligible`

Purpose:

- fetch only currently active and connected WhatsApp senders with remaining quota

### `GET /api/v1/whatsapp/senders/:id`

Purpose:

- fetch detail for one WhatsApp sender

## Optional Explicit Sender Selection

These are additive fields on existing send APIs:

### Email

```json
{
  "to": "lead@example.com",
  "subject": "Hello",
  "html": "<p>Hello</p>",
  "selectedMailAccountId": "mail_123"
}
```

### WhatsApp

```json
{
  "toPhone": "+919999999999",
  "message": "Hello",
  "selectedWhatsAppAccountId": "wa_123"
}
```

Rules:

- if omitted, keep current pooled sender selection behavior
- if provided, validate eligibility
- if invalid, reject safely
- if valid, pin the sender for that request only

---

## API Documentation for MVP Developers

This section should also be reused in the MVP codebase docs.

## Authenticate

All outbound API requests require:

```http
Authorization: Bearer YOUR_API_KEY
```

## Connect a Workspace

The MVP operator should enter:

- `Workspace Name`
- `Base URL` = `https://prane.one`
- `API Key`

The MVP backend should validate by calling a lightweight overview or sender endpoint.

## Fetch Eligible Email Senders

```bash
curl "https://prane.one/api/v1/email/senders/eligible" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Use this when:

- showing mailbox choices in the UI
- deciding which sender can be used for a seed test
- checking readiness before explicit sender pinning

## Fetch Eligible WhatsApp Senders

```bash
curl "https://prane.one/api/v1/whatsapp/senders/eligible" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Send Using Pooled Selection

Email:

```bash
curl -X POST "https://prane.one/api/v1/email/send" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"to\":\"seed@gmail.com\",\"subject\":\"Seed test\",\"html\":\"<p>Hello</p>\"}"
```

WhatsApp:

```bash
curl -X POST "https://prane.one/api/v1/whatsapp/send" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"toPhone\":\"+919999999999\",\"message\":\"Health check message\"}"
```

## Send Using an Explicit Selected Sender

Email:

```bash
curl -X POST "https://prane.one/api/v1/email/send" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"to\":\"seed@gmail.com\",\"subject\":\"Seed test\",\"html\":\"<p>Hello</p>\",\"selectedMailAccountId\":\"mail_123\"}"
```

WhatsApp:

```bash
curl -X POST "https://prane.one/api/v1/whatsapp/send" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"toPhone\":\"+919999999999\",\"message\":\"Health check message\",\"selectedWhatsAppAccountId\":\"wa_123\"}"
```

## Poll Request Status

```bash
curl "https://prane.one/api/v1/requests/REQUEST_ID" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

Expected lifecycle:

- `QUEUED`
- `PROCESSING`
- `SENT`
- `FAILED`
- `REJECTED_NO_CAPACITY`

Useful fields:

- selected sender
- processed time
- provider message id
- failure reason

---

## Backend Workflow Examples

## Example: Sender Sync

1. run scheduled sync for workspace
2. call `GET /api/v1/email/senders/eligible`
3. call `GET /api/v1/whatsapp/senders/eligible`
4. upsert sender records locally
5. update sync run status

## Example: Email Seed Test

1. operator selects sender or lets policy engine choose
2. backend creates seed test record
3. backend calls `POST /api/v1/email/send`
4. backend stores returned `requestId`
5. worker polls `GET /api/v1/requests/:id`
6. once sent, inbox observer checks seed inboxes
7. store placement result
8. recalculate sender score

## Example: WhatsApp Sender Readiness Check

1. sync WhatsApp senders
2. evaluate `isActive`, `connectionStatus`, `sentToday`, `remainingQuota`
3. mark sender as:
   - eligible
   - limited
   - blocked

---

## UI Requirements

## Key Dashboard Cards

- healthy email senders
- at-risk email senders
- connected WhatsApp senders
- Gmail inbox rate
- spam rate
- placement trend
- blocked senders

## Tables

### Email sender table columns

- sender
- provider
- warmup
- mailbox health
- score
- sent today
- daily limit
- remaining quota
- eligible
- last seed result

### WhatsApp sender table columns

- sender
- number
- connection
- score
- sent today
- daily limit
- remaining quota
- eligible

## Charts

- sender score over time
- domain score over time
- provider placement stacked chart
- inbox vs spam trend

---

## Permissions and Security

- store outbound API keys encrypted at rest
- never expose raw workspace API keys to the frontend after save
- log all outbound API calls with redacted auth
- use per-workspace isolation in the MVP database
- use role-based access later if multiple operators need access

---

## Reliability Requirements

- retries for outbound API calls
- exponential backoff on request polling
- timeout protection for seed inbox observation
- sync run audit logs
- idempotent seed test creation where possible
- dead-letter handling for failed jobs

---

## Development Phases

## Phase 1: Foundation

- workspace connection model
- `https://prane.one` API client
- sender sync endpoints integration
- frontend workspace screen

## Phase 2: Sender Visibility

- email sender list screen
- WhatsApp sender list screen
- health status cards
- initial scoring engine

## Phase 3: Seed Testing

- seed account setup
- test creation screen
- dispatch via outbound API
- request polling
- seed placement observation

## Phase 4: Health Intelligence

- sender snapshots
- domain snapshots
- recommendations
- risk reasons

## Phase 5: Operator Actions

- choose sender manually
- choose pooled mode
- policy suggestions
- scheduling and alerts

---

## MVP Success Criteria

The MVP is successful when:

- it can connect to `https://prane.one` using an API key
- it can fetch active and eligible senders
- it can run an email seed test through the outbound system
- it can observe and classify seed placement
- it can produce a mailbox score and domain score
- it can tell an operator whether a sender should be used today

---

## Final Notes

This MVP should be built as a separate product and should not replace the current outbound app.

The live outbound system should only receive:

- additive read APIs
- optional explicit sender selection fields
- improved API documentation

The live system should continue to behave exactly the same for current clients unless they explicitly use the new sender-selection capabilities.

This approach gives you:

- no disruption to current users
- fast MVP execution
- a strong deliverability-focused product layer
- a future foundation for a real outbound intelligence platform
