ALTER TABLE "MailAccount"
ADD COLUMN "warmupDailyLimit" INTEGER NOT NULL DEFAULT 40,
ADD COLUMN "warmupSentToday" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "warmupProviderPreference" TEXT NOT NULL DEFAULT 'random',
ADD COLUMN "trackingDomain" TEXT;
