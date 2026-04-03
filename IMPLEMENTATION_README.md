# Zoho, Unified Inbox, WhatsApp, and Cleanup Update

## What Was Implemented

### 1. Zoho account connection flow

The Zoho flow was changed so one mailbox is treated as one account record.

- SMTP and Zoho OAuth now match on the same normalized email address.
- A Zoho mailbox is only considered fully ready when both SMTP and OAuth are connected for the same email.
- The Mail Accounts UI now shows partial setup states:
  - `SMTP connected, OAuth pending`
  - `OAuth connected, SMTP pending`
  - `SMTP + OAuth pending`
  - `SMTP + OAuth connected`
- Campaign activation for Zoho is blocked until both sides are connected.
- A new modal flow was added for:
  - `Connect new Zoho account`
  - choose `SMTP`
  - or choose `OAuth`

Main files:

- `apps/web/app/api/mail-accounts/zoho/route.ts`
- `apps/web/lib/zohoMailApi.ts`
- `worker/lib/zohoMailApi.ts`
- `apps/web/app/api/mail-accounts/route.ts`
- `apps/web/components/mail-accounts/MailAccountsSections.tsx`
- `apps/web/components/mail-accounts/useMailAccountsDashboard.ts`

### 2. Unified inbox for email

A new dashboard page was added:

- `/inbox`

Email inbox features:

- show messages from all connected email inboxes
- filter by account
- filter by folder:
  - `Inbox`
  - `Spam`
  - `Sent`
- search by sender, recipient, subject, snippet
- mark message as read
- rescue spam to inbox
- reply to inbound messages
- clear synced email inbox cache from database

Main files:

- `apps/web/app/(dashboard)/inbox/page.tsx`
- `apps/web/app/api/inbox/route.ts`

### 3. Sent mail visibility improvement

The account dashboard now allows opening the `Sent` mailbox folder directly, which helps verify sent mailbox sync behavior from the sender account view.

Main file:

- `apps/web/components/mail-accounts/MailAccountsSections.tsx`

### 4. Unified inbox for WhatsApp

WhatsApp support was extended so the inbox shows only software-managed conversations.

That means:

- not all device chats are shown
- only conversations created by software outbound sends are stored and displayed
- inbound replies are saved only for those managed conversations
- replies from the inbox are queued through the existing WhatsApp worker

Main files:

- `worker/lib/whatsappBaileys.ts`
- `worker/processors/whatsappProcessor.ts`
- `apps/web/app/api/inbox/route.ts`
- `apps/web/app/(dashboard)/inbox/page.tsx`

### 5. Auto cleanup and manual cleanup

To stop inbox sync data from growing forever:

- email synced inbox data is auto-pruned
- WhatsApp managed inbox data is auto-pruned
- manual clear actions were added from the inbox UI

Retention defaults:

- Email inbox cache: `30` days
- WhatsApp inbox cache: `45` days

Optional env overrides:

- `MAILBOX_SYNC_RETENTION_DAYS`
- `WHATSAPP_INBOX_RETENTION_DAYS`

Main files:

- `worker/scheduler/cronScheduler.ts`
- `apps/web/lib/inboxCleanup.ts`

### 6. Database changes

New WhatsApp managed conversation models were added:

- `WhatsAppConversation`
- `WhatsAppConversationMessage`

Also added:

- `SentWhatsAppMessage.providerMessageId`

Schema files:

- `apps/web/prisma/schema.prisma`
- `worker/prisma/schema.prisma`

Migration files added:

- `apps/web/prisma/migrations/20260403_unified_inbox_and_cleanup/migration.sql`
- `worker/prisma/migrations/20260403_unified_inbox_and_cleanup/migration.sql`

## Build Status

The code was built successfully for both apps.

Commands used:

```powershell
cd apps/web
npm run db:generate
npm run build

cd ..\..\worker
npm run db:generate
npm run build
```

### Database sync note

`prisma migrate deploy` could not be used on this local database because the database already existed without Prisma migration baselining and returned:

- `P3005`

So the schema was applied successfully with:

```powershell
cd apps/web
npm run db:push
```

## How To Verify

### A. Verify Zoho connection flow

1. Open `/mail-accounts`
2. Open `Add Zoho`
3. Click `Connect new Zoho account`
4. Choose `SMTP`
5. Connect a Zoho SMTP account using an email like `user@domain.com`
6. Confirm the mailbox appears with:
   - `SMTP connected, OAuth pending`
7. Use the same Zoho email and connect OAuth
8. Confirm the same mailbox record now shows:
   - `SMTP + OAuth connected`
9. Confirm it does not create a second Zoho mailbox row for the same email
10. Try to activate a partially configured Zoho mailbox and confirm activation is blocked

Expected result:

- same email matches into one mailbox record
- full connection only after both SMTP and OAuth are attached

### B. Verify email unified inbox

1. Open `/inbox`
2. Stay on `Email Inbox`
3. Test filters:
   - change account
   - change folder
   - search by sender/subject
4. Open a mailbox from `/mail-accounts` and run `Sync mailbox`
5. Confirm new synced messages appear in `/inbox`
6. For unread inbound mail:
   - click `Mark read`
7. For spam mail:
   - click `Rescue to inbox`
8. For inbound mail:
   - click `Reply`
   - submit reply
9. Re-sync mailbox and confirm sent/replied state is visible

Expected result:

- inbox shows data across accounts
- actions succeed
- sent folder can be opened from Mail Accounts

### C. Verify WhatsApp managed inbox

1. Ensure a WhatsApp account is connected and `CONNECTED`
2. Send a WhatsApp message through existing software flow:
   - campaign
   - or API
   - or inbox reply queue
3. Open `/inbox`
4. Switch to `WhatsApp Inbox`
5. Confirm the conversation appears
6. Reply from the inbox
7. Confirm the reply is queued and sent
8. Send a message from an unrelated personal chat on the device
9. Confirm that unrelated chat does not appear unless it belongs to a software-started conversation

Expected result:

- only software-managed conversations are listed
- replies continue through worker pipeline

### D. Verify cleanup logic

#### Manual cleanup

1. Open `/inbox`
2. Click:
   - `Clear email cache`
   - or `Clear whatsapp cache`
3. Confirm synced records disappear from inbox view

#### Automatic cleanup

1. Set short retention values in env for testing:

```env
MAILBOX_SYNC_RETENTION_DAYS=3
WHATSAPP_INBOX_RETENTION_DAYS=3
```

2. Restart the worker
3. Wait for scheduled cleanup tick or trigger scheduler cycle in your local run
4. Confirm old cached inbox records are removed

Expected result:

- old synced records are pruned
- conversation/thread shells without messages are also removed

### E. Verify builds again locally

Run:

```powershell
cd apps/web
npm run build

cd ..\..\worker
npm run build
```

Expected result:

- both builds pass without TypeScript errors

## Quick File Map

- Zoho UI and status:
  - `apps/web/components/mail-accounts/MailAccountsSections.tsx`
  - `apps/web/components/mail-accounts/useMailAccountsDashboard.ts`
  - `apps/web/components/mail-accounts/types.ts`
- Zoho backend:
  - `apps/web/app/api/mail-accounts/zoho/route.ts`
  - `apps/web/lib/zohoMailApi.ts`
  - `worker/lib/zohoMailApi.ts`
- Inbox UI:
  - `apps/web/app/(dashboard)/inbox/page.tsx`
- Inbox API:
  - `apps/web/app/api/inbox/route.ts`
- Cleanup:
  - `apps/web/lib/inboxCleanup.ts`
  - `worker/scheduler/cronScheduler.ts`
- WhatsApp managed conversations:
  - `worker/lib/whatsappBaileys.ts`
  - `worker/processors/whatsappProcessor.ts`

## Final Notes

- The new inbox is meant for operational handling, not permanent archival.
- The database now stores only software-owned WhatsApp conversation history.
- If you want, the next good step is adding:
  - message pagination
  - reply templates
  - bulk delete per mailbox/account
  - explicit “connection checklist” badges for Zoho in the card header
