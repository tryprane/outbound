DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApiDispatchChannel') THEN
    CREATE TYPE "ApiDispatchChannel" AS ENUM ('EMAIL', 'WHATSAPP');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApiDispatchStatus') THEN
    CREATE TYPE "ApiDispatchStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'REJECTED_NO_CAPACITY');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ApiKey" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE INDEX IF NOT EXISTS "ApiKey_isActive_createdAt_idx" ON "ApiKey"("isActive", "createdAt");

CREATE TABLE IF NOT EXISTS "ApiDispatchRequest" (
  "id" TEXT NOT NULL,
  "channel" "ApiDispatchChannel" NOT NULL,
  "status" "ApiDispatchStatus" NOT NULL DEFAULT 'QUEUED',
  "requestedTo" TEXT NOT NULL,
  "subject" TEXT,
  "content" TEXT NOT NULL,
  "idempotencyKey" TEXT,
  "metadata" JSONB,
  "apiKeyId" TEXT NOT NULL,
  "selectedMailAccountId" TEXT,
  "selectedWhatsAppAccountId" TEXT,
  "errorMessage" TEXT,
  "providerMessageId" TEXT,
  "queuedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiDispatchRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ApiDispatchRequest_channel_status_createdAt_idx" ON "ApiDispatchRequest"("channel", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "ApiDispatchRequest_apiKeyId_createdAt_idx" ON "ApiDispatchRequest"("apiKeyId", "createdAt");
CREATE INDEX IF NOT EXISTS "ApiDispatchRequest_selectedMailAccountId_createdAt_idx" ON "ApiDispatchRequest"("selectedMailAccountId", "createdAt");
CREATE INDEX IF NOT EXISTS "ApiDispatchRequest_selectedWhatsAppAccountId_createdAt_idx" ON "ApiDispatchRequest"("selectedWhatsAppAccountId", "createdAt");

ALTER TABLE "ApiDispatchRequest" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;
ALTER TABLE "MailAccount" ADD COLUMN IF NOT EXISTS "apiReservationKey" TEXT;
ALTER TABLE "MailAccount" ADD COLUMN IF NOT EXISTS "apiReservedUntil" TIMESTAMP(3);
ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "apiReservationKey" TEXT;
ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "apiReservedUntil" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "ApiDispatchRequest_apiKeyId_idempotencyKey_key" ON "ApiDispatchRequest"("apiKeyId", "idempotencyKey");

ALTER TABLE "SentMail" ALTER COLUMN "campaignId" DROP NOT NULL;
ALTER TABLE "SentMail" ALTER COLUMN "csvRowId" DROP NOT NULL;
ALTER TABLE "SentWhatsAppMessage" ALTER COLUMN "campaignId" DROP NOT NULL;
ALTER TABLE "SentWhatsAppMessage" ALTER COLUMN "csvRowId" DROP NOT NULL;

ALTER TABLE "SentMail" ADD COLUMN IF NOT EXISTS "apiDispatchRequestId" TEXT;
ALTER TABLE "SentWhatsAppMessage" ADD COLUMN IF NOT EXISTS "apiDispatchRequestId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "SentMail_apiDispatchRequestId_key" ON "SentMail"("apiDispatchRequestId");
CREATE UNIQUE INDEX IF NOT EXISTS "SentWhatsAppMessage_apiDispatchRequestId_key" ON "SentWhatsAppMessage"("apiDispatchRequestId");
CREATE INDEX IF NOT EXISTS "SentMail_apiDispatchRequestId_idx" ON "SentMail"("apiDispatchRequestId");
CREATE INDEX IF NOT EXISTS "SentWhatsAppMessage_apiDispatchRequestId_idx" ON "SentWhatsAppMessage"("apiDispatchRequestId");

ALTER TABLE "ApiDispatchRequest"
  ADD CONSTRAINT "ApiDispatchRequest_apiKeyId_fkey"
  FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApiDispatchRequest"
  ADD CONSTRAINT "ApiDispatchRequest_selectedMailAccountId_fkey"
  FOREIGN KEY ("selectedMailAccountId") REFERENCES "MailAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ApiDispatchRequest"
  ADD CONSTRAINT "ApiDispatchRequest_selectedWhatsAppAccountId_fkey"
  FOREIGN KEY ("selectedWhatsAppAccountId") REFERENCES "WhatsAppAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SentMail"
  ADD CONSTRAINT "SentMail_apiDispatchRequestId_fkey"
  FOREIGN KEY ("apiDispatchRequestId") REFERENCES "ApiDispatchRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SentWhatsAppMessage"
  ADD CONSTRAINT "SentWhatsAppMessage_apiDispatchRequestId_fkey"
  FOREIGN KEY ("apiDispatchRequestId") REFERENCES "ApiDispatchRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
