# Warmup System Build Review

## Purpose

This document explains what was built for the Gmail and Zoho warmup system, how the main parts fit together, what protection/automation now exists, and what still remains if we want to push the system even further.

The scope of the work was:

- build a real mailbox interaction engine, not just send-only warmup
- support Gmail and Zoho only
- add mailbox health and domain health automation
- add domain and reputation guardrails
- add operator controls for review, suppression, and diagnostics

---

## Final System Summary

The system is now much more than a basic warmup sender.

It includes:

- Gmail + Zoho mailbox provider layer
- mailbox sync engine
- mailbox interaction worker
- delayed open/reply/rescue behavior
- warmup ramp-up scheduling
- mailbox health scoring
- domain health scoring
- DNS and domain authentication diagnostics
- blacklist/reputation checks
- campaign guardrails and auto-pause
- complaint handling and suppression
- sent-mail review actions
- bulk warmup-recipient import

This means the platform now behaves like an early production-grade warmup engine with strong operational safety, not just a simple mail rotation tool.

---

## What Was Built

## 1. Mailbox Provider Foundation

Implemented a provider abstraction for Gmail and Zoho only.

Main files:

- `worker/lib/mailboxProviders/types.ts`
- `worker/lib/mailboxProviders/index.ts`
- `worker/lib/mailboxProviders/gmailMailboxProvider.ts`
- `worker/lib/mailboxProviders/zohoMailboxProvider.ts`
- `worker/lib/mailboxProviders/utils.ts`

What it supports:

- fetch mailbox folders/labels
- fetch recent messages
- map provider message metadata into internal models
- mark messages read
- rescue spam to inbox
- send replies
- Gmail API handling
- Zoho IMAP/SMTP handling

Why it matters:

- this is the layer that converted the old send-only system into a real mailbox-aware system

---

## 2. Mailbox Sync Engine

Implemented a background sync engine for Gmail and Zoho mailboxes.

Main files:

- `worker/processors/mailboxSyncProcessor.ts`
- `worker/queues/mailboxSyncQueue.ts`
- `worker/runtime/workerSupervisor.ts`
- `worker/scheduler/cronScheduler.ts`
- `apps/web/lib/mailboxSyncQueue.ts`

What it does:

- polls inboxes on schedule
- syncs inbox, spam, and sent state
- upserts mailbox threads
- upserts mailbox messages
- stores provider IDs and message metadata
- tracks sync status, sync errors, and last sync time
- triggers follow-up interaction jobs after sync

Why it matters:

- without this, the system cannot know where messages landed or how the mailbox is behaving

---

## 3. Mailbox Interaction Engine

Implemented a real mailbox interaction worker.

Main files:

- `worker/processors/mailboxInteractionProcessor.ts`
- `worker/queues/mailboxInteractionQueue.ts`
- `worker/processors/mailboxSyncProcessor.ts`

What it does:

- processes synced warmup messages
- detects warmup mail
- schedules mailbox actions in stages
- rescues spam to inbox when detected
- marks mail as read after randomized delay
- triggers reply behavior after randomized delay

What changed from the original system:

- earlier, replies were simulated from the send side
- now the system has real mailbox-side interaction logic

---

## 4. Delayed Human-Like Behavior

Added staged interaction behavior instead of immediate mailbox action.

Main behavior:

- rescue happens first when needed
- open/read happens later
- reply happens later than read
- timings are randomized instead of immediate

Why it matters:

- this reduces robotic patterns
- it makes the warmup activity feel more like human mailbox behavior

---

## 5. Warmup Pairing and Pool Improvements

Improved warmup pairing logic.

Main file:

- `worker/processors/warmupProcessor.ts`

What changed:

- system now prefers cross-domain pairings
- warmup recipient choice is spread more carefully
- same sender-recipient behavior is less repetitive

Why it matters:

- domain diversity is important for realistic warmup and reputation protection

---

## 6. Ramp-Up and Warmup Progression

The platform already had a basic warmup ramp-up; this was preserved and integrated with the health system.

Main file:

- `worker/scheduler/cronScheduler.ts`

Current progression behavior:

- warmup stage changes daily
- recommended daily limit is derived from stage
- promotion/regression is based on recent success/failure rates
- warmup completion state is updated automatically

Why it matters:

- mailbox volume now grows with monitoring rather than with a static manual setting

---

## 7. Mailbox Health Scoring

Added mailbox-health-aware automation.

Data model:

- `WarmupHealthSnapshot`
- new fields on `MailAccount`

Main files:

- `apps/web/prisma/schema.prisma`
- `worker/prisma/schema.prisma`
- `worker/processors/mailboxSyncProcessor.ts`
- `apps/web/app/api/mail-accounts/route.ts`

Tracked health concepts:

- inbox rate
- spam rate
- read rate
- reply rate
- rescue rate
- health score
- health status

Automation built on top:

- reduce pace when health declines
- auto-pause when mailbox health becomes risky
- auto-resume basics when health recovers

Why it matters:

- warmup is no longer blind sending
- mailbox behavior now controls sender eligibility

---

## 8. Domain Health and History

Implemented domain-level health tracking and snapshots.

Data model:

- `DomainHealthSnapshot`

Main files:

- `apps/web/prisma/schema.prisma`
- `worker/prisma/schema.prisma`
- `worker/scheduler/cronScheduler.ts`
- `apps/web/app/api/mail-accounts/route.ts`

What it tracks:

- mailbox count by domain
- healthy/warming/at-risk/paused mailbox counts
- average health score
- active campaign count
- 7-day sent volume
- 7-day bounce rate
- 7-day failure rate
- 14-day complaint count

Why it matters:

- sender safety is not only a mailbox problem
- domains can now be treated as shared reputation units

---

## 9. Domain Diagnostics and Reputation Checks

Expanded domain diagnostics from simple DNS hints into actionable domain-risk analysis.

Main file:

- `apps/web/lib/domainDiagnostics.ts`

Checks implemented:

- SPF presence and provider alignment
- DKIM selector checks
- DMARC presence and policy
- MX presence and provider alignment
- MX IP resolution
- DNSBL lookup for blacklist signals
- risk score
- severity
- recommended action

Returned diagnostics now include:

- `riskScore`
- `severity`
- `recommendedAction`
- `blacklist`
- `mxIps`

Why it matters:

- domain safety now has actual enforcement value
- operators can see why a domain is risky, not just that it is risky

---

## 10. Campaign Guardrails

Added stronger send eligibility and auto-pause logic for campaigns.

Main files:

- `worker/lib/campaignGuardrails.ts`
- `apps/web/lib/campaignGuardrails.ts`
- `worker/processors/campaignProcessor.ts`
- `worker/scheduler/cronScheduler.ts`
- `apps/web/app/api/campaigns/route.ts`
- `apps/web/app/api/campaigns/[id]/start/route.ts`
- `apps/web/app/api/campaigns/[id]/route.ts`
- `apps/web/app/api/campaigns/[id]/pause/route.ts`

Guardrails now use:

- mailbox active state
- warmup completion state
- mailbox health status
- mailbox health score
- mailbox sync state
- domain-risk diagnostics
- domain unhealthy ratio
- recent bounce/failure pressure
- recent complaint events

What the system can do now:

- reject campaign creation if assigned senders are not safe
- reject campaign start if assigned senders are not safe
- auto-pause active campaigns if domain risk grows
- clear guardrail reason when safe again

Why it matters:

- campaigns are now constrained by health and reputation, not just by account assignment

---

## 11. Mail Sending Backstops

Strengthened the final send path so unsafe mail cannot slip through.

Main file:

- `worker/processors/mailProcessor.ts`

Protections added:

- mailbox health gate
- mailbox sync error gate
- recent sender reputation gate
- hard bounce classification
- auto-suppress hard-bounced recipients

What changed:

- hard-bounce-style errors are no longer stored as generic failures only
- bounce-like recipients are automatically inserted into the unsubscribe/suppression list

Why it matters:

- the actual send worker now respects the same quality rules as the UI and scheduler

---

## 12. Complaint Handling

Added first-class complaint tracking.

Data model:

- `ComplaintEvent`

Main files:

- `apps/web/prisma/schema.prisma`
- `worker/prisma/schema.prisma`
- `apps/web/app/api/sent/route.ts`
- `worker/scheduler/cronScheduler.ts`
- `apps/web/app/api/mail-accounts/route.ts`

Capabilities added:

- mark a sent mail as complaint from the UI/API
- complaint creates a complaint event
- complaint recipient is automatically suppressed
- complaint count affects domain health
- complaint count can auto-pause campaigns

Why it matters:

- recipient complaint handling is one of the most important production safety features

---

## 13. Suppression and Bounce Enforcement

The unsubscribe list now plays a larger operational role.

Main files:

- `apps/web/app/api/unsubscribe/route.ts`
- `apps/web/app/api/sent/route.ts`
- `worker/processors/mailProcessor.ts`
- `worker/processors/campaignProcessor.ts`

Current behavior:

- unsubscribed emails are skipped by campaigns
- manually marked complaints are suppressed
- manually marked bounces are suppressed
- worker-classified hard bounces are suppressed

Why it matters:

- bad recipients stop damaging reputation repeatedly

---

## 14. API and Dashboard Additions

Extended the operational UI and APIs to make the system reviewable.

Main files:

- `apps/web/app/api/mail-accounts/route.ts`
- `apps/web/app/(dashboard)/mail-accounts/page.tsx`
- `apps/web/app/(dashboard)/campaigns/page.tsx`
- `apps/web/app/(dashboard)/campaigns/[id]/page.tsx`
- `apps/web/app/api/sent/route.ts`
- `apps/web/app/(dashboard)/sent/page.tsx`

New operator visibility includes:

- mailbox sync state
- mailbox health score
- mailbox health notes
- domain health summary
- domain health history
- domain diagnostics severity
- blacklist hits
- complaint counts
- bounce/failure rates
- campaign guardrail reason
- sent-mail complaint/bounce actions

Why it matters:

- this is now an operable system, not just a backend mechanism

---

## 15. Bulk Warmup Recipient Import

Added warmup pool administration tooling.

Main files:

- `apps/web/app/api/mail-accounts/route.ts`
- `apps/web/app/(dashboard)/mail-accounts/page.tsx`

What it supports:

- bulk import of warmup recipients
- email parsing from commas/spaces/newlines
- deduplication by email

Why it matters:

- pool setup becomes much faster for larger warmup systems

---

## Data Model Changes

The most important schema changes were:

- new `MailboxThread`
- new `MailboxMessage`
- new `WarmupHealthSnapshot`
- new `DomainHealthSnapshot`
- new `ComplaintEvent`

Extended `MailAccount` with:

- mailbox sync metadata
- mailbox health score
- mailbox health status
- IMAP configuration for Zoho

Extended `Campaign` with:

- `guardrailReason`

Extended `SentMail` relations with:

- complaint event linkage

---

## Files Most Important to Review

If someone wants the shortest serious review path, these are the most important files:

- `worker/processors/mailboxSyncProcessor.ts`
- `worker/processors/mailboxInteractionProcessor.ts`
- `worker/processors/warmupProcessor.ts`
- `worker/processors/mailProcessor.ts`
- `worker/scheduler/cronScheduler.ts`
- `worker/processors/campaignProcessor.ts`
- `apps/web/lib/domainDiagnostics.ts`
- `apps/web/app/api/mail-accounts/route.ts`
- `apps/web/app/api/campaigns/route.ts`
- `apps/web/app/api/campaigns/[id]/start/route.ts`
- `apps/web/app/api/sent/route.ts`
- `apps/web/app/(dashboard)/mail-accounts/page.tsx`
- `apps/web/app/(dashboard)/sent/page.tsx`

---

## Verification Performed

The implementation was verified repeatedly during development with:

- `npx prisma db push` in `apps/web`
- `npx prisma generate` in `worker`
- `npm run build` in `worker`
- `npx tsc --noEmit` in `apps/web`
- `npm run build` in `apps/web`

These completed successfully at the end of the work.

---

## What Is Fully or Mostly Done

The following areas are now fully or mostly done:

- Gmail/Zoho provider support
- mailbox sync
- mailbox interaction engine
- delayed open/reply/rescue behavior
- ramp-up scheduling basics
- warmup pairing improvements
- mailbox health automation
- domain health automation
- DNS and domain-auth diagnostics
- blacklist and risk scoring
- campaign auto-pause guardrails
- complaint handling
- bounce suppression
- operator dashboards and review tooling

---

## What Still Remains If We Want To Go Further

The largest remaining gaps are now mostly advanced product polish and deeper intelligence, not missing core infrastructure.

Remaining items:

- richer thread-aware reply intelligence across more edge cases
- larger and smarter content/subject variation library
- more advanced behavior timing simulation
- deeper complaint ingestion from mailbox/provider side instead of manual review only
- broader blacklist/reputation provider coverage
- richer long-term charts and analytics
- tagging, bulk mailbox onboarding, and admin workflows for large teams

---

## Practical Conclusion

The system is no longer a simple warmup sender.

It is now a real Gmail/Zoho warmup and mailbox-interaction platform with:

- provider-aware mailbox sync
- send + read + rescue + reply behavior
- mailbox and domain health models
- campaign-level and sender-level safety enforcement
- complaint and bounce handling
- operator review tools

If someone reviews this repo now, they should evaluate it as a real warmup platform with good safety foundations, not as an MVP-only prototype.
