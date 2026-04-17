ALTER TABLE "MailboxMessage"
  ADD COLUMN IF NOT EXISTS "analysisStatus" TEXT NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS "analysisRequestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "analyzedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "analysisModel" TEXT,
  ADD COLUMN IF NOT EXISTS "analysisLabel" TEXT,
  ADD COLUMN IF NOT EXISTS "analysisShouldReply" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "analysisPriority" TEXT,
  ADD COLUMN IF NOT EXISTS "analysisSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "analysisReason" TEXT,
  ADD COLUMN IF NOT EXISTS "analysisError" TEXT,
  ADD COLUMN IF NOT EXISTS "analysisRaw" JSONB;

CREATE INDEX IF NOT EXISTS "MailboxMessage_openedAt_analysisStatus_receivedAt_idx"
  ON "MailboxMessage"("openedAt", "analysisStatus", "receivedAt");

CREATE INDEX IF NOT EXISTS "MailboxMessage_analysisLabel_analysisPriority_analyzedAt_idx"
  ON "MailboxMessage"("analysisLabel", "analysisPriority", "analyzedAt");
