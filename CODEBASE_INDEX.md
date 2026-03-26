# Outbound System Codebase Index

Last indexed: 2026-03-19
Workspace: `C:\Users\ghans\OneDrive\Desktop\outbound`

## 1) High-level Architecture

- Monorepo with 3 runtime services:
- `apps/web`: Next.js 14 app (UI + API routes).
- `worker`: BullMQ-based async orchestration + sending engine.
- `apps/scraper`: FastAPI microservice for website scraping.
- Shared infra via `docker-compose.yml`: `postgres`, `redis`, plus the 3 app services.

## 2) Top-level Structure

- `apps/web`: frontend + backend APIs.
- `worker`: queue definitions, workers, scheduler.
- `apps/scraper`: Python scraping service.
- `prisma/` and `prisma.config.ts`: Prisma config at repo level.
- `outbound-system-plan.md`: product/system planning doc (reference, not runtime truth).

## 3) Core Runtime Flow

1. CSV uploaded in web app (`/api/csv/upload`) and rows persisted as `CsvFile` + `CsvRow`.
2. Campaign created (`/api/campaigns`) with campaign settings and assigned sender accounts.
3. Campaign started (`/api/campaigns/[id]/start`) by setting status to `active`.
4. Worker cron scheduler polls active campaigns every 60s and enqueues `campaign-queue` jobs.
5. `campaignProcessor` picks next row, enforces limits/intervals, optional scraping, dedupe checks, Gemini generation, then enqueues mail jobs.
6. `mailProcessor` sends via Zoho SMTP or Gmail API, then records success/failure in DB.
7. Daily reset in scheduler zeroes `MailAccount.sentToday` at local midnight of worker runtime.

## 4) Web App (`apps/web`)

### UI routes (App Router)

- Dashboard shell: `app/(dashboard)/layout.tsx`, `app/(dashboard)/page.tsx`
- Campaigns: list/new/detail/logs under `app/(dashboard)/campaigns/*`
- CSV: list/upload/detail under `app/(dashboard)/csv/*`
- Mail accounts: `app/(dashboard)/mail-accounts/page.tsx`
- Sent logs: `app/(dashboard)/sent/page.tsx`
- Login: `app/login/page.tsx`

### API routes

- Campaigns:
- `app/api/campaigns/route.ts` (`GET`, `POST`)
- `app/api/campaigns/[id]/route.ts` (`GET`, `PATCH`, `DELETE`)
- `app/api/campaigns/[id]/start/route.ts` (`POST`)
- `app/api/campaigns/[id]/pause/route.ts` (`POST`)
- `app/api/campaigns/preview/route.ts`, `app/api/campaigns/[id]/preview/route.ts`
- CSV:
- `app/api/csv/upload/route.ts` (`POST`, `GET`)
- `app/api/csv/map-columns/route.ts` (`POST`)
- `app/api/csv/[id]/route.ts` (`GET`, `DELETE`)
- Mail accounts:
- `app/api/mail-accounts/route.ts` (`GET`, `PATCH`, `DELETE`)
- `app/api/mail-accounts/zoho/route.ts` (`POST`, `GET`)
- `app/api/mail-accounts/gmail/route.ts` (`GET`, `DELETE`)
- `app/api/mail-accounts/gmail/callback/route.ts` (`GET`)
- Other:
- `app/api/scrape/route.ts` (`POST`, `GET`)
- `app/api/sent/route.ts` (`GET`)
- `app/api/unsubscribe/route.ts` (`GET`, `POST`, `DELETE`)
- `app/api/auth/[...nextauth]/route.ts`

### Important libraries

- DB/infra: `lib/prisma.ts`, `lib/redis.ts`, `lib/encryption.ts`
- AI: `lib/gemini.ts`
- Mail: `lib/mailer/zoho.ts`, `lib/mailer/gmail.ts`
- CSV: `lib/csv-parser/parser.ts`, `lib/csv-parser/column-detector.ts`

## 5) Worker (`worker`)

### Entry + scheduler

- `index.ts`: boots scrape/mail/campaign workers + cron scheduler.
- `scheduler/cronScheduler.ts`:
- Poll active campaigns every 60 seconds.
- Schedule daily reset of account counters.

### Queues

- `queues/campaignQueue.ts`
- `queues/scrapeQueue.ts`
- `queues/mailQueue.ts`

### Processors

- `processors/campaignProcessor.ts`:
- campaign state checks (`active` only)
- row progression via `currentRowIndex`
- round-robin account selection + interval enforcement
- optional scrape job wait
- unsubscribe and duplicate guards
- Gemini content generation
- enqueue mail job
- `processors/scrapeProcessor.ts`:
- calls scraper `/scrape/website`
- updates `CsvRow.scrapeStatus/scrapedEmail/scrapedPhone`
- `processors/mailProcessor.ts`:
- sends through Zoho/Gmail
- refreshes Gmail access token when expired
- writes `SentMail` records and account counters

## 6) Scraper Service (`apps/scraper`)

- `main.py` FastAPI routes:
- `GET /health`
- `POST /scrape/website`
- `POST /scrape/bulk`
- `POST /extract/email`
- `POST /extract/phone`
- Scraping modules:
- `scrapers/website_scraper.py`
- `scrapers/email_extractor.py`
- `scrapers/phone_extractor.py`

## 7) Data Model (Prisma)

Main entities in `apps/web/prisma/schema.prisma` and mirrored in `worker/prisma/schema.prisma`:

- `MailAccount`
- `CsvFile`
- `CsvRow`
- `Campaign`
- `CampaignMailAccount`
- `SentMail`
- `UnsubscribeList`
- NextAuth tables: `User`, `Account`, `Session`, `VerificationToken`

## 8) Configuration and Ops

- Compose orchestration: `docker-compose.yml`
- Env source: root `.env` (consumed by web + worker)
- Key env vars:
- `DATABASE_URL`, `REDIS_URL`, `SCRAPER_SERVICE_URL`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GEMINI_API_KEY`
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`

## 9) Known Notes for Future Changes

- `outbound-system-plan.md` is a planning artifact; current code is the source of truth.
- Dynamic route folders like `[id]` require PowerShell `-LiteralPath` when reading directly.
- Worker and web keep separate package/dependency trees; change both when shared behavior is modified.
