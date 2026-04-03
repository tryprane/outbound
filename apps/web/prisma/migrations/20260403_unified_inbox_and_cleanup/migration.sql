ALTER TABLE "SentWhatsAppMessage" ADD COLUMN IF NOT EXISTS "providerMessageId" TEXT;
CREATE INDEX IF NOT EXISTS "SentWhatsAppMessage_providerMessageId_idx" ON "SentWhatsAppMessage"("providerMessageId");

CREATE TABLE IF NOT EXISTS "WhatsAppConversation" (
  "id" TEXT NOT NULL,
  "whatsappAccountId" TEXT NOT NULL,
  "participantJid" TEXT NOT NULL,
  "participantPhone" TEXT,
  "participantName" TEXT,
  "isManaged" BOOLEAN NOT NULL DEFAULT true,
  "lastMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WhatsAppConversationMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "whatsappAccountId" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "direction" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" TEXT,
  "sentAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppConversationMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppConversation_whatsappAccountId_participantJid_key"
  ON "WhatsAppConversation"("whatsappAccountId", "participantJid");
CREATE INDEX IF NOT EXISTS "WhatsAppConversation_whatsappAccountId_lastMessageAt_idx"
  ON "WhatsAppConversation"("whatsappAccountId", "lastMessageAt");

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppConversationMessage_whatsappAccountId_providerMessageId_key"
  ON "WhatsAppConversationMessage"("whatsappAccountId", "providerMessageId");
CREATE INDEX IF NOT EXISTS "WhatsAppConversationMessage_conversationId_createdAt_idx"
  ON "WhatsAppConversationMessage"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "WhatsAppConversationMessage_whatsappAccountId_createdAt_idx"
  ON "WhatsAppConversationMessage"("whatsappAccountId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'WhatsAppConversation_whatsappAccountId_fkey'
  ) THEN
    ALTER TABLE "WhatsAppConversation"
      ADD CONSTRAINT "WhatsAppConversation_whatsappAccountId_fkey"
      FOREIGN KEY ("whatsappAccountId") REFERENCES "WhatsAppAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'WhatsAppConversationMessage_conversationId_fkey'
  ) THEN
    ALTER TABLE "WhatsAppConversationMessage"
      ADD CONSTRAINT "WhatsAppConversationMessage_conversationId_fkey"
      FOREIGN KEY ("conversationId") REFERENCES "WhatsAppConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'WhatsAppConversationMessage_whatsappAccountId_fkey'
  ) THEN
    ALTER TABLE "WhatsAppConversationMessage"
      ADD CONSTRAINT "WhatsAppConversationMessage_whatsappAccountId_fkey"
      FOREIGN KEY ("whatsappAccountId") REFERENCES "WhatsAppAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
