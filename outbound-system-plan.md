# OutreachOS — Outbound Automation System
## Full Implementation Plan for Agency Internal Tool

---

## 1. SYSTEM OVERVIEW

**OutreachOS** is an internal outbound automation platform that:
- Ingests messy CSVs of digital marketing agencies
- Scrapes missing emails/WhatsApp numbers from their websites using Scrapling
- Generates AI-personalized outreach emails via Gemini
- Sends via multiple Zoho Business + Gmail accounts using Round Robin scheduling
- Handles Indian and International campaign types
- Tracks every sent mail per account with full analytics

---

## 2. TECH STACK

| Layer | Technology | Why |
|---|---|---|
| **Frontend** | Next.js 14 (App Router) + TypeScript | SSR, API routes, file handling |
| **UI** | Tailwind CSS + shadcn/ui | Fast internal tool UI |
| **Backend** | Node.js (Next.js API Routes + separate Worker service) | Unified codebase |
| **Job Queue** | BullMQ + Redis | Cron jobs, concurrency, rate limiting |
| **Database** | PostgreSQL (via Prisma ORM) | Structured relational data |
| **Scraping** | Scrapling (Python microservice via FastAPI) | Best-in-class scraping |
| **AI** | Google Gemini 1.5 Flash API | Personalized mail generation |
| **Email Send** | Nodemailer (Zoho SMTP) + Gmail API (OAuth2) | Dual mail account support |
| **CSV Parsing** | PapaParse + custom column mapper | Handle unstructured CSVs |
| **Auth** | NextAuth.js | Google OAuth for Gmail connect |
| **Cache** | Redis | Rate limit tracking, job state |
| **Hosting** | Docker Compose (self-hosted VPS) | Internal tool, full control |

---

## 3. FILE & FOLDER STRUCTURE

```
outreach-os/
├── apps/
│   ├── web/                          # Next.js Frontend + API
│   │   ├── app/
│   │   │   ├── (dashboard)/
│   │   │   │   ├── page.tsx           # Dashboard overview
│   │   │   │   ├── campaigns/
│   │   │   │   │   ├── page.tsx       # All campaigns list
│   │   │   │   │   ├── new/
│   │   │   │   │   │   └── page.tsx   # Create campaign wizard
│   │   │   │   │   └── [id]/
│   │   │   │   │       ├── page.tsx   # Campaign detail
│   │   │   │   │       └── logs/
│   │   │   │   │           └── page.tsx  # Sent mail logs
│   │   │   │   ├── csv/
│   │   │   │   │   ├── page.tsx       # CSV upload & management
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx   # CSV rows viewer
│   │   │   │   ├── mail-accounts/
│   │   │   │   │   └── page.tsx       # Connect/manage mail accounts
│   │   │   │   └── sent/
│   │   │   │       └── page.tsx       # Unified sent mail view
│   │   │   ├── api/
│   │   │   │   ├── auth/[...nextauth]/ # Google OAuth
│   │   │   │   ├── csv/
│   │   │   │   │   ├── upload/route.ts
│   │   │   │   │   ├── [id]/route.ts
│   │   │   │   │   └── map-columns/route.ts
│   │   │   │   ├── mail-accounts/
│   │   │   │   │   ├── zoho/route.ts
│   │   │   │   │   └── gmail/route.ts
│   │   │   │   ├── campaigns/
│   │   │   │   │   ├── route.ts
│   │   │   │   │   └── [id]/
│   │   │   │   │       ├── route.ts
│   │   │   │   │       ├── start/route.ts
│   │   │   │   │       └── pause/route.ts
│   │   │   │   ├── scrape/
│   │   │   │   │   └── route.ts       # Proxy to Python scraper
│   │   │   │   └── sent/
│   │   │   │       └── route.ts
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── csv/
│   │   │   │   ├── CsvUploader.tsx
│   │   │   │   ├── ColumnMapper.tsx    # Map messy columns to standard fields
│   │   │   │   └── CsvPreviewTable.tsx
│   │   │   ├── campaigns/
│   │   │   │   ├── CampaignWizard.tsx  # Multi-step campaign creator
│   │   │   │   ├── CampaignTypeSelector.tsx  # Indian / International
│   │   │   │   ├── DataEnrichmentOptions.tsx # Scrape email/WA toggle
│   │   │   │   ├── MailDistributionPlanner.tsx
│   │   │   │   └── PromptEditor.tsx
│   │   │   ├── mail-accounts/
│   │   │   │   ├── ZohoAccountForm.tsx
│   │   │   │   └── GmailOAuthButton.tsx
│   │   │   └── shared/
│   │   │       ├── Sidebar.tsx
│   │   │       └── StatusBadge.tsx
│   │   ├── lib/
│   │   │   ├── prisma.ts
│   │   │   ├── redis.ts
│   │   │   ├── gemini.ts
│   │   │   ├── mailer/
│   │   │   │   ├── zoho.ts
│   │   │   │   └── gmail.ts
│   │   │   └── csv-parser/
│   │   │       ├── parser.ts
│   │   │       └── column-detector.ts  # AI/regex column guessing
│   │   └── prisma/
│   │       └── schema.prisma
│   │
│   └── scraper/                       # Python FastAPI Microservice
│       ├── main.py                    # FastAPI app
│       ├── scrapers/
│       │   ├── website_scraper.py     # Scrapling-based scraper
│       │   ├── email_extractor.py     # Regex email extraction
│       │   └── phone_extractor.py     # Indian/Intl phone regex
│       ├── requirements.txt
│       └── Dockerfile
│
├── worker/                            # BullMQ Worker (separate Node process)
│   ├── index.ts                       # Worker entry point
│   ├── queues/
│   │   ├── campaignQueue.ts           # Main campaign queue
│   │   ├── scrapeQueue.ts             # Scraping jobs
│   │   └── mailQueue.ts              # Email send queue
│   ├── processors/
│   │   ├── campaignProcessor.ts       # Orchestrator
│   │   ├── scrapeProcessor.ts         # Calls Python scraper
│   │   └── mailProcessor.ts          # Sends mail via Nodemailer/Gmail
│   └── scheduler/
│       └── cronScheduler.ts           # Daily campaign trigger
│
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 4. DATABASE SCHEMA (Prisma)

```prisma
model MailAccount {
  id           String   @id @default(cuid())
  type         String   // "zoho" | "gmail"
  email        String   @unique
  displayName  String
  // Zoho fields
  smtpHost     String?
  smtpPort     Int?
  smtpPassword String?  // encrypted
  // Gmail fields
  accessToken  String?  // encrypted
  refreshToken String?
  dailyLimit   Int      @default(40)
  sentToday    Int      @default(0)
  lastResetAt  DateTime @default(now())
  createdAt    DateTime @default(now())
  sentMails    SentMail[]
  campaigns    CampaignMailAccount[]
}

model CsvFile {
  id           String    @id @default(cuid())
  originalName String
  storagePath  String
  rowCount     Int
  columnMap    Json      // { name: "col_A", website: "col_C", email: "col_F", ... }
  uploadedAt   DateTime  @default(now())
  rows         CsvRow[]
  campaigns    Campaign[]
}

model CsvRow {
  id            String   @id @default(cuid())
  csvFileId     String
  csvFile       CsvFile  @relation(fields: [csvFileId], references: [id])
  rowIndex      Int
  rawData       Json     // original row data
  name          String?
  website       String?
  email         String?
  whatsapp      String?
  scrapedEmail  String?
  scrapedPhone  String?
  scrapeStatus  String   @default("pending") // pending|done|failed
  sentMails     SentMail[]
}

model Campaign {
  id               String   @id @default(cuid())
  name             String
  type             String   // "indian" | "international"
  status           String   @default("draft") // draft|active|paused|completed
  csvFileId        String
  csvFile          CsvFile  @relation(fields: [csvFileId], references: [id])
  prompt           String   // AI mail generation prompt
  scrapeEmail      Boolean  @default(false)
  scrapeWhatsapp   Boolean  @default(false)
  dailyMailsPerAccount Int  @default(40)
  currentRowIndex  Int      @default(0)  // round robin progress
  createdAt        DateTime @default(now())
  mailAccounts     CampaignMailAccount[]
  sentMails        SentMail[]
}

model CampaignMailAccount {
  campaignId    String
  mailAccountId String
  campaign      Campaign    @relation(fields: [campaignId], references: [id])
  mailAccount   MailAccount @relation(fields: [mailAccountId], references: [id])
  sentCount     Int         @default(0)
  @@id([campaignId, mailAccountId])
}

model SentMail {
  id            String      @id @default(cuid())
  campaignId    String
  campaign      Campaign    @relation(fields: [campaignId], references: [id])
  csvRowId      String
  csvRow        CsvRow      @relation(fields: [csvRowId], references: [id])
  mailAccountId String
  mailAccount   MailAccount @relation(fields: [mailAccountId], references: [id])
  toEmail       String
  subject       String
  body          String
  status        String      // "sent" | "failed" | "bounced"
  sentAt        DateTime    @default(now())
  errorMessage  String?
}
```

---

## 5. KEY FLOWS IN DETAIL

### 5.1 CSV Upload & Column Mapping

```
User uploads CSV
      ↓
PapaParse reads headers + first 5 rows
      ↓
column-detector.ts runs heuristics:
  - "name", "agency", "company" → name field
  - "website", "url", "domain"  → website field  
  - contains "@"                → email field
  - 10-digit / +91 / +1        → phone field
      ↓
Show ColumnMapper UI: user confirms/corrects mappings
      ↓
Save CsvFile + all CsvRows to DB with columnMap stored
```

### 5.2 Campaign Creation Wizard (5 Steps)

```
Step 1: Basic Info
  - Campaign name
  - Select CSV file (from uploaded CSVs)
  - Campaign type: Indian 🇮🇳 / International 🌍

Step 2: Data Check
  - Show % of rows with email present
  - Show % of rows with phone/WA present
  - Toggle: "Scrape missing emails?" → uses Scrapling
  - Toggle: "Scrape missing WhatsApp?" → uses Scrapling
  - Phone format: Indian (+91, 10-digit) or Intl (+country code)

Step 3: Mail Accounts
  - Show all connected mail accounts (Zoho + Gmail)
  - Multi-select which accounts to use for this campaign
  - Distribution preview (Round Robin visualization)

Step 4: Schedule & Limits
  - Daily mails per account (slider, default 40)
  - Live calculator:
      Total rows: 500
      Accounts selected: 5
      Daily limit: 40/account → 200/day
      Days to complete: ~2.5 days → shows "3 days"
  - Sending interval: auto-calculated
      e.g. 40 mails/account/day = 1 mail per 36 mins per account

Step 5: AI Prompt
  - Rich text prompt editor
  - Available variables: {agency_name}, {website}, {scraped_content}
  - Preview: Generate sample mail with first row
  - Save & Launch / Save as Draft
```

### 5.3 Scraping Pipeline (Python FastAPI)

```python
# POST /scrape/website
# Input: { url, type: "indian"|"international", extract: ["email","phone"] }

async def scrape_website(url, campaign_type, extract):
    page = await scrapling.fetch(url)
    
    results = {}
    
    if "email" in extract:
        # Scan full page text + mailto links
        emails = re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', page.text)
        results["email"] = emails[0] if emails else None
    
    if "phone" in extract:
        if campaign_type == "indian":
            # Match: +91XXXXXXXXXX, 91XXXXXXXXXX, 0XXXXXXXXXX, XXXXXXXXXX
            phones = re.findall(r'(?:\+91|91|0)?[6-9]\d{9}', page.text)
        else:
            # Match international: +1, +44, +61, etc.
            phones = re.findall(r'\+[1-9]\d{1,14}', page.text)
        results["phone"] = phones[0] if phones else None
    
    return results
```

### 5.4 Mail Sending Engine (Round Robin + Rate Limiting)

```
Campaign Active
      ↓
cronScheduler.ts fires every minute → checks all active campaigns
      ↓
For each campaign:
  - Calculate: how many mails can still be sent today per account
  - Check: interval between mails per account
    (e.g. 40 mails/8hr workday = 1 mail every 12 mins)
      ↓
campaignProcessor.ts picks next CsvRow (currentRowIndex++)
      ↓
Round Robin: pick next available MailAccount
  - Account must have: sentToday < dailyLimit
  - Account must have: lastMailSentAt > interval ago
      ↓
If row has no email AND scrapeEmail=true:
  → enqueue scrapeQueue job → await result → update CsvRow
      ↓
Call Gemini API:
  prompt = userPrompt + rowData + scrapedContent
  → generate subject + body
      ↓
enqueue mailQueue job:
  → send via Zoho SMTP or Gmail API
  → on success: create SentMail record, increment sentToday
  → on failure: retry 3x, then mark failed
      ↓
Multiple campaigns run simultaneously via BullMQ concurrency
```

### 5.5 Daily Reset Cron

```
Every day at midnight:
  - Reset sentToday = 0 for all MailAccounts
  - Reset lastResetAt = now()
  - Log daily summary per campaign
```

---

## 6. MAIL ACCOUNT CONNECTION

### Zoho Business Mail (5 accounts)
- Manual SMTP credentials form: host, port, email, password
- Test connection before saving
- Store password encrypted (AES-256)

### Gmail Personal Accounts (multiple)
- Google OAuth2 flow via NextAuth
- Request `gmail.send` scope only
- Store refresh token encrypted
- Auto-refresh access token on expiry

---

## 7. SENT MAIL DASHBOARD

Per account view showing:
- Total sent today / this week / all time
- Success rate (sent vs failed)
- Campaign breakdown
- Full log: recipient, subject, time, status

Global view:
- All accounts combined
- Filter by campaign, date range, status
- Export to CSV

---

## 8. WHAT YOU DESCRIBED + ADDITIONS I'VE ADDED

| Feature | Your Requirement | Added/Enhanced |
|---|---|---|
| CSV upload | ✅ | + AI column auto-detection |
| Zoho mail accounts | ✅ 5 accounts | + encrypted credential storage |
| Gmail accounts | ✅ multiple | + OAuth2 token auto-refresh |
| Sent mail per account view | ✅ | + analytics dashboard |
| Scrapling for email/WA | ✅ | + dedicated Python microservice |
| Indian vs International campaigns | ✅ | + phone regex differs per type |
| Scrape toggle per campaign | ✅ | Per-campaign, not global |
| Daily mail limit per account | ✅ | + live calculator in UI |
| Gemini AI prompt | ✅ | + variable injection + preview |
| Round Robin distribution | ✅ | + per-account interval enforcement |
| Multiple simultaneous jobs | ✅ | BullMQ concurrency |
| Interval-spaced sending | ✅ | Auto-calculated from daily limit |
| **Bounce/failure handling** | ❌ missing | Retry 3x, then mark failed + alert |
| **Unsubscribe tracking** | ❌ missing | Track opt-outs, never re-email |
| **Duplicate email guard** | ❌ missing | Cross-campaign deduplication |
| **Scrape queue status** | ❌ missing | Show scraping progress per campaign |
| **Email warm-up tracking** | ❌ missing | Track account reputation metrics |
| **Preview before send** | ❌ missing | Generate sample mail before launch |

---

## 9. ENVIRONMENT VARIABLES

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/outreachos

# Redis
REDIS_URL=redis://localhost:6379

# Google (Gmail OAuth + Gemini)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GEMINI_API_KEY=

# Encryption
ENCRYPTION_KEY=32-char-secret-key

# Scraper Service
SCRAPER_SERVICE_URL=http://localhost:8000

# NextAuth
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
```

---

## 10. DOCKER COMPOSE

```yaml
services:
  web:
    build: ./apps/web
    ports: ["3000:3000"]
    depends_on: [postgres, redis]
    env_file: .env

  worker:
    build: ./worker
    depends_on: [postgres, redis]
    env_file: .env

  scraper:
    build: ./apps/scraper
    ports: ["8000:8000"]

  postgres:
    image: postgres:15
    volumes: [pgdata:/var/lib/postgresql/data]
    environment:
      POSTGRES_DB: outreachos
      POSTGRES_PASSWORD: password

  redis:
    image: redis:7-alpine
    volumes: [redisdata:/data]

volumes:
  pgdata:
  redisdata:
```

---

## 11. BUILD ORDER (Recommended)

```
Phase 1 — Foundation (Week 1)
  ✅ Prisma schema + DB setup
  ✅ Docker Compose running
  ✅ NextAuth + basic layout/sidebar

Phase 2 — CSV Engine (Week 1-2)
  ✅ CSV upload + PapaParse
  ✅ Column mapper UI
  ✅ CsvRow storage

Phase 3 — Mail Accounts (Week 2)
  ✅ Zoho SMTP form + connection test
  ✅ Gmail OAuth2 flow
  ✅ Account management page

Phase 4 — Scraper Service (Week 2-3)
  ✅ Python FastAPI + Scrapling setup
  ✅ Email + phone extraction
  ✅ Indian/Intl phone regex

Phase 5 — Campaign Wizard (Week 3)
  ✅ 5-step wizard UI
  ✅ Calculator component
  ✅ Gemini prompt + preview

Phase 6 — Job Engine (Week 3-4)
  ✅ BullMQ setup + Redis
  ✅ Campaign/Scrape/Mail queues
  ✅ Round Robin logic
  ✅ Interval scheduling
  ✅ Daily reset cron

Phase 7 — Sent Mail Dashboard (Week 4)
  ✅ Per-account logs
  ✅ Global analytics view
  ✅ Export CSV

Phase 8 — Polish & Safety (Week 4-5)
  ✅ Unsubscribe tracking
  ✅ Duplicate guard
  ✅ Error notifications
  ✅ Retry logic
```

---

## 12. SCALABILITY NOTES

- **BullMQ** supports horizontal scaling — run multiple worker instances
- **Redis** acts as the single source of truth for rate limits across workers
- **Scraper** is stateless — scale horizontally with load balancer
- **Daily limits** enforced atomically in Redis to prevent race conditions
- **Campaign isolation** — each campaign's queue is independent

---

*OutreachOS — Built for internal agency use. Not for resale.*
