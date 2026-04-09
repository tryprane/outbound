# Bug Fix Changelog — Mailbox Sync & Warmup System

> All fixes were applied in session dated **2026-04-10**.

> **⚠️ Regression Found & Fixed (Bug 14):** Removing the warmup processor's immediate reply block (Bug 9/10) introduced a regression — replies via the interaction processor were not updating `sentToday`, `lastMailSentAt`, or creating `WarmupMailLog` entries. This was caught and patched in the same session. See Bug 14 below.

---

## Summary

| # | Bug Name | Severity | File Fixed |
|---|---|---|---|
| 1 | Zoho IMAP Dependency | 🔴 Critical | `zohoMailboxProvider.ts` |
| 2 | Zoho API No Date Filter | 🔴 High | `zohoMailApi.ts` + `zohoMailboxProvider.ts` |
| 3 | Zoho `messageIdHeader` Always Null | 🟡 Medium | `zohoMailboxProvider.ts` |
| 4 | Zoho Permanent Skip On Error | 🟡 Medium | `mailboxSyncProcessor.ts` |
| 5 | Zoho IMAP Error Hard-Coded Skip | 🔴 High | `mailboxSyncProcessor.ts` |
| 6 | Zoho Wrong Eligibility Check | 🟡 Medium | `cronScheduler.ts` |
| 7 | Warmup Reply — Wrong Sender/Recipient Names | 🔴 Critical | `warmupProcessor.ts` |
| 8 | Warmup Reply — Unrelated Hardcoded Subject | 🔴 Critical | `warmupProcessor.ts` |
| 9 | Warmup Reply — Sent As New Email, No Threading | 🔴 Critical | `warmupProcessor.ts` |
| 10 | Warmup Reply — Duplicate Reply System Conflict | 🔴 High | `warmupProcessor.ts` |
| 11 | Gmail Token Expiry Null Never Refreshed | 🟡 Medium | `gmailMailboxProvider.ts` |
| 12 | Reply Content Too Generic (No Gemini) | 🟡 Medium | `mailboxInteractionProcessor.ts` + `geminiWarmup.ts` |
| 13 | Too Few Warmup Templates | 🟢 Low | `warmupProcessor.ts` + `mailboxInteractionProcessor.ts` |
| 14 | ⚠️ Regression — Reply Bypasses Warmup Accounting | 🔴 Critical | `mailboxInteractionProcessor.ts` |

---

## Bug Details & Fixes

---

### Bug 1 — Zoho IMAP Dependency
**File:** `worker/lib/mailboxProviders/zohoMailboxProvider.ts`

**Problem:**
The `ZohoMailboxProvider` class had a full IMAP fallback path using `ImapFlow` and `nodemailer`. Since Zoho IMAP requires manual enabling per mailbox and is often blocked, this caused sync failures for most Zoho accounts. The provider tried IMAP when OAuth was unavailable and failed silently.

**Fix:**
Completely rewrote `zohoMailboxProvider.ts` to be **100% Zoho Mail API (OAuth) only**. Removed:
- `ImapFlow` and `nodemailer` imports
- `connect()` private method
- `parseStoredMessageRef()` private method
- All IMAP fallback branches in `listFolders`, `listRecentMessages`, `markAsRead`, `rescueToInbox`, `sendReply`

`isZohoImapDisabledError()` is kept as a stub returning `false` for backward compatibility.

---

### Bug 2 — Zoho API No Date Filter (Missing Messages)
**Files:** `worker/lib/zohoMailApi.ts`, `worker/lib/mailboxProviders/zohoMailboxProvider.ts`

**Problem:**
`listZohoMessages()` fetched only the most recent `limit` (25) messages with no date boundary. On busy mailboxes with >25 emails in 7 days, older messages in the sync window were silently dropped. Unlike the IMAP path which used `client.search({ since })`, the API path had no equivalent filter.

**Fix:**
- Added `receivedAfter?: number` (epoch milliseconds) parameter to `listZohoMessages()`
- Since Zoho returns messages sorted **newest-first**, the function now breaks early on the first message older than the cutoff — efficient O(n) filtering
- `zohoMailboxProvider.ts` passes `receivedAfter = Date.now() - days * 86400000`
- `limitPerFolder` bumped from 25 → **50** to give the date filter more to work with

```typescript
// zohoMailApi.ts — new filter logic
for (const msg of raw) {
  const ts = Number(msg.receivedTime ?? msg.sentDateInGMT ?? 0)
  if (ts === 0 || ts >= cutoff) {
    filtered.push(msg)
  } else {
    break // sorted desc — everything after is older
  }
}
```

---

### Bug 3 — Zoho `messageIdHeader` / `inReplyToHeader` Always Null
**File:** `worker/lib/zohoMailApi.ts` → `mapZohoMessageRecord()`

**Problem:**
The Zoho message list API does not return raw email headers (`Message-ID`, `In-Reply-To`, `References`). These were hardcoded as `null` in `mapZohoMessageRecord()`. As a result:
- Thread resolution fell back to `providerMessageId` as `providerThreadId` — every Zoho message became its own thread
- Replies sent via the interaction processor had no `In-Reply-To` header and didn't thread in email clients

**Fix:**
Accepted the API limitation. The Zoho `threadId` field (returned by the list API) is used as `providerThreadId` for grouping — this correctly groups messages into conversations at the Zoho level. The `sendReply` path in the interaction processor uses `sendZohoReply()` with `action: 'reply'` which Zoho threads server-side using the message ID.

---

### Bug 4 — Zoho Permanent Skip On Auth Error (No Retry)
**File:** `worker/processors/mailboxSyncProcessor.ts`

**Problem:**
`shouldSkipMailboxSync()` permanently skipped Zoho accounts when `mailboxSyncError === 'Reconnect Zoho account to restore mailbox API access'`. Once a token expired, even after the user reconnected OAuth, the account would never retry because the error string remained in the DB and there was no escape hatch.

**Fix:**
Replaced the permanent skip with a **6-hour backoff**. After 6 hours from the last successful sync, the account is retried automatically. This means a reconnected account recovers on its own within 6 hours without manual intervention.

```typescript
// New logic — skip only during the backoff window
if (account.type === 'zoho' && account.mailboxSyncError === ZOHO_AUTH_SKIP_MESSAGE) {
  const lastSync = account.mailboxLastSyncedAt
  if (!lastSync) return true
  return Date.now() - lastSync.getTime() < ZOHO_AUTH_RETRY_AFTER_MS // 6h
}
```

---

### Bug 5 — Zoho IMAP Error Strings Causing False Positives
**File:** `worker/processors/mailboxSyncProcessor.ts`

**Problem:**
`shouldSkipMailboxSync()` checked for IMAP-specific error strings:
- `'Enable IMAP for this Zoho mailbox, then retry mailbox sync'`
- `'Zoho IMAP is turned off for this mailbox'`

Since IMAP is now removed, these errors will never occur on new accounts. But accounts with these old error strings in the DB would still be permanently skipped, making legitimate API-configured accounts appear broken.

**Fix:**
Removed IMAP-specific error strings from the skip logic entirely. The legacy `ZOHO_IMAP_DISABLED_MESSAGE` constant is kept only to cover old DB records — they now fall through to the 6-hour backoff rather than a permanent skip.

---

### Bug 6 — Zoho Wrong Eligibility Check In Cron Scheduler
**File:** `worker/scheduler/cronScheduler.ts`

**Problem:**
`pollMailboxSyncAccounts()` selected Zoho accounts with either `smtpPassword OR zohoRefreshToken`. Accounts with only SMTP credentials (IMAP mode) were being queued for sync even though IMAP was removed. This created jobs that would always fail immediately.

**Fix:**
Changed Zoho eligibility to **only** require `zohoRefreshToken`:

```typescript
// Before
{ type: 'zoho', OR: [{ smtpPassword: { not: null } }, { zohoRefreshToken: { not: null } }] }

// After
{ type: 'zoho', zohoRefreshToken: { not: null } }
```

Also added `mailboxLastSyncedAt` to the `select` so `shouldSkipMailboxSync()` can evaluate the backoff window.

---

### Bug 7 — Warmup Reply: Wrong Sender/Recipient Name Order
**File:** `worker/processors/warmupProcessor.ts`

**Problem:**
The immediate reply was built with sender and recipient names **swapped**:

```typescript
// Broken — replier is sending, sender (original) is receiving
const reply = buildReplyMail(sender.displayName, replier.displayName)
//                            ^^^^ should be replier   ^^^^ should be sender
```

`buildReplyMail(senderName, recipientName)` used `recipientName` in `"Hi ${recipientName},"`. With the args swapped, the reply said **"Hi [replier's own name],"** — the email was greeting itself.

**Fix:**
Removed the broken reply block entirely (see Bug 9). The interaction processor handles replies correctly with proper name resolution from the stored message.

---

### Bug 8 — Warmup Reply: Hardcoded Subject Unrelated To Original Email
**File:** `worker/processors/warmupProcessor.ts`

**Problem:**
`buildReplyMail()` picked subjects from a hardcoded list like `'Re: Quick hello'`, `'Re: Checking in'` — completely ignoring what the original warmup email's subject actually was. The recipient would see a reply with a subject that didn't match the email they received, making the thread look incoherent.

**Fix:**
Removed the broken reply block. The interaction processor's `buildReplySubject()` correctly reads `refreshed.subject` from the stored inbound message and prefixes `"Re: "` only if not already present. Gemini is also passed `originalSubject` to generate contextually accurate subjects.

---

### Bug 9 — Warmup Reply: Sent As New Email (No Threading Headers)
**File:** `worker/processors/warmupProcessor.ts`

**Problem:**
The immediate reply in `processWarmupJob` called `sendFromAccount()` — the same function used for campaign outbound sends — which sends a plain new email with no `In-Reply-To` or `References` headers. Email clients (Gmail, Outlook, Zoho) would not group this reply with the original conversation thread.

**Fix:**
Removed the entire immediate reply block from `warmupProcessor.ts`. Replies are now handled exclusively by `mailboxInteractionProcessor.ts` which calls `provider.sendReply()`:
- **Gmail:** uses the Gmail API `messages.send()` with `threadId` set, correctly threading
- **Zoho API:** uses `sendZohoReply()` with `action: 'reply'`, threading server-side

---

### Bug 10 — Duplicate Reply System Conflict
**File:** `worker/processors/warmupProcessor.ts`

**Problem:**
Two separate reply systems were running simultaneously:
1. **Immediate reply** in `warmupProcessor.ts` (broken, no threading, wrong names)
2. **Delayed reply** via `mailboxInteractionProcessor.ts` after mailbox sync (correct)

With `REPLY_PROBABILITY = 0.65` and `DEFAULT_REPLY_PERCENT = 70%`, roughly **45.5%** of warmup emails triggered **two replies** — one broken and one correct.

**Fix:**
Removed the immediate reply block from `warmupProcessor.ts` entirely. The mailbox sync + interaction processor pipeline is the single authoritative reply system. Dead code also cleaned up:
- `REPLY_PROBABILITY` constant removed
- `OUTBOUND_TEMPLATES` array removed (was defined but never used)
- `REPLY_TEMPLATES` array removed (was defined but never used)
- `buildReplyMail()` function removed

---

### Bug 11 — Gmail Token Expiry Null Never Refreshed
**File:** `worker/lib/mailboxProviders/gmailMailboxProvider.ts`

**Problem:**
```typescript
// Old — null evaluates as falsy, refresh never runs
const isExpired = account.tokenExpiry && account.tokenExpiry < new Date()
```
If `tokenExpiry` was `null` (never set after initial OAuth), the expression evaluated to `false` and the access token was reused indefinitely — even if it had silently expired. This caused sporadic 401 errors on Gmail sync with no clear cause.

**Fix:**
```typescript
// New — null means "unknown expiry", treat as expired to be safe
const isExpired = !account.tokenExpiry || account.tokenExpiry < new Date()
```

---

### Bug 12 — Warmup Reply Content Too Generic (No Gemini Integration)
**Files:** `worker/processors/mailboxInteractionProcessor.ts`, `worker/lib/geminiWarmup.ts`

**Problem:**
The interaction processor's reply stage always used 5 hardcoded generic templates like `"Thanks for the note. Sending a quick reply from my side."` — never using Gemini. Outbound warmup sends already had 20% Gemini usage; replies had 0%.

**Fix:**

**`geminiWarmup.ts`:**
- Added `direction: 'outbound' | 'reply'` to `GenerateWarmupMailOptions`
- Added `originalSubject?: string` to the options type
- Separate system + user prompts for each direction
- Reply prompt instructs Gemini to prefix subject with `"Re: "` and write like a genuine natural response

**`mailboxInteractionProcessor.ts`:**
- Added `GEMINI_REPLY_PROBABILITY = 0.75` constant
- At reply stage, calls `generateWarmupMailWithGemini({ direction: 'reply', originalSubject })` at 75% probability
- Falls back to template if Gemini fails or returns null

---

### Bug 13 — Too Few Warmup Templates (Low Uniqueness)
**Files:** `worker/processors/warmupProcessor.ts`, `worker/processors/mailboxInteractionProcessor.ts`

**Problem:**
The `buildWarmupMail()` function had only 34 total variant entries across 4 arrays, producing a small number of visually distinct emails before repeating. At scale with many mailboxes, patterns would repeat noticeably.

**Fix:**
Massively expanded all template arrays:

| Array | Before | After |
|---|---|---|
| Subjects | 12 | **40** |
| Openings | 4 | **15** |
| Middle body | 10 | **40** |
| Closings | 8 | **20** |

**Result: 40 × 15 × 40 × 20 = 480,000+ unique email combinations**

Each array uses a different seed value for `pickTemplate()`, so subject, opening, body, and closing are independently varied per sender/recipient/stage combination.

Reply body fallback templates in `mailboxInteractionProcessor.ts` expanded from **5 → 30** variants.

---

## Files Changed

| File | Change Type |
|---|---|
| `worker/lib/mailboxProviders/zohoMailboxProvider.ts` | Full rewrite — API only |
| `worker/lib/zohoMailApi.ts` | `listZohoMessages` — added `receivedAfter` date filter |
| `worker/processors/mailboxSyncProcessor.ts` | Removed IMAP skips, added 6h backoff |
| `worker/scheduler/cronScheduler.ts` | Zoho eligibility fix + `mailboxLastSyncedAt` select |
| `worker/processors/warmupProcessor.ts` | Removed broken reply block + dead code + 100+ templates |
| `worker/processors/mailboxInteractionProcessor.ts` | Gemini replies + 30 reply variants + warmup accounting fix |
| `worker/lib/geminiWarmup.ts` | Added `direction: 'reply'` + `originalSubject` support |
| `worker/lib/mailboxProviders/gmailMailboxProvider.ts` | Fixed `tokenExpiry = null` refresh logic |

---

### Bug 14 — ⚠️ Regression: Reply Bypasses Warmup Accounting
**File:** `worker/processors/mailboxInteractionProcessor.ts`

**How it was introduced:**
Fixing Bugs 7–10 removed the broken immediate reply block from `warmupProcessor.ts`. That block was broken (wrong names, no threading, wrong subject), but it did correctly record three pieces of warmup state on the replier's account:
1. `sentToday: { increment: 1 }` — daily send counter
2. `lastMailSentAt: new Date()` — cooldown timestamp
3. `WarmupMailLog` entry with `direction: 'reply'` — stage progression data

The replacement path (`mailboxInteractionProcessor.ts`) sent the reply correctly via `provider.sendReply()` but only updated `repliedAt` on the message record. It completely skipped all three accounting writes.

**Impact:**
- **Pacing broken:** `sentToday` not incremented → replier's daily counter is understated → warmup processor may dispatch additional outbound sends on the same day when the account is already over effective limit
- **Cooldown broken:** `lastMailSentAt` not updated → warmup processor's interval check (`now - lastMailSentAt < intervalMs`) doesn't see the recent reply send → next outbound send fires sooner than intended
- **Stage progression skewed:** `computeWarmupProgression()` in the daily reset reads `WarmupMailLog` to compute success/fail rate. Without reply logs, it only sees outbound sends — the activity picture is incomplete

**Fix:**
Replaced the single `repliedAt` update with a single atomic `$transaction` that updates all three:

```typescript
await prisma.$transaction([
  prisma.mailboxMessage.update({
    where: { id: refreshed.id },
    data: { repliedAt: new Date() },
  }),
  prisma.mailAccount.update({
    where: { id: refreshed.mailAccount.id },
    data: {
      sentToday: { increment: 1 },
      lastMailSentAt: new Date(),
    },
  }),
  prisma.warmupMailLog.create({
    data: {
      senderMailAccountId: refreshed.mailAccount.id,
      recipientEmail: counterpart,
      recipientType: siblingMailbox ? 'system' : 'external',
      recipientMailAccountId: siblingMailbox?.id ?? undefined,
      direction: 'reply',
      subject: replySubject,
      body: replyBody,
      status: 'sent',
      stage: refreshed.mailAccount.warmupStage,
    },
  }),
])
```

The transaction is atomic — if any step fails (e.g., DB constraint), nothing is partially committed. The reply is still sent before the transaction, so a send failure would not be recorded (the outer BullMQ worker handles job retry in that case).

