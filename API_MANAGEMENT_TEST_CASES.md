# API Management Test Cases

## Setup
- Have at least one `WARMED` + `ACTIVE` mail account with remaining quota.
- Have at least one `CONNECTED` + `ACTIVE` WhatsApp account with remaining quota.
- Start the web app and worker so `api-dispatch-queue`, `mail-queue`, and `whatsapp-queue` are active.

## API Key Management
- Create a new API key from `/api-management` and confirm the plaintext key is shown once.
- Refresh the page and confirm the plaintext key is no longer recoverable.
- Revoke an active API key and confirm it changes to inactive in the dashboard.
- Call `POST /api/v1/email/send` with the revoked key and expect `401`.
- Call `GET /api/v1/requests/:id` with a different valid API key and expect `404`.

## Email Send API
- Call `POST /api/v1/email/send` with `html` content and expect `202` plus `requestId`.
- Poll `GET /api/v1/requests/:id` and confirm status moves `QUEUED -> PROCESSING -> SENT`.
- Verify one eligible mail account was selected and stored on `ApiDispatchRequest`.
- Verify a `SentMail` row exists with `apiDispatchRequestId` populated.
- Verify the selected mail account increments `sentToday` only when the message is marked `sent`.
- Verify the message appears in `/api-management` recent request logs and in `/sent`.

## WhatsApp Send API
- Call `POST /api/v1/whatsapp/send` with a valid phone number/message and expect `202`.
- Poll `GET /api/v1/requests/:id` and confirm status moves `QUEUED -> PROCESSING -> SENT`.
- Verify one eligible WhatsApp account was selected and stored on `ApiDispatchRequest`.
- Verify a `SentWhatsAppMessage` row exists with `apiDispatchRequestId` populated.
- Verify the selected WhatsApp account increments `sentToday` only on success.

## Validation and Failure Paths
- Call the email API without `html` and `text` and expect `400`.
- Call the WhatsApp API with an empty `message` and expect `400`.
- Call either API without `Authorization` and expect `401`.
- Disable all eligible mail accounts and confirm the queued request ends as `REJECTED_NO_CAPACITY`.
- Disconnect all WhatsApp accounts and confirm the queued request ends as `REJECTED_NO_CAPACITY`.
- Force a downstream send failure and confirm the request ends as `FAILED` without incrementing `sentToday`.

## Pooling and Quota
- Create two eligible mail accounts with different `lastMailSentAt` values and confirm the oldest eligible account is chosen first.
- Repeat enough email requests to hit one account's daily limit and confirm selection moves to another eligible account.
- Repeat the same checks for WhatsApp accounts.
- Mix campaign traffic and API traffic and confirm the same per-account quota counters are shared.

## Regression Checks
- Open `/sent` and confirm campaign-origin logs still render correctly.
- Confirm API-origin logs render without a campaign link and are labeled as API traffic.
- Create and start a normal campaign and verify campaign sending still works.
- Run the existing web and worker builds after any follow-up changes.
