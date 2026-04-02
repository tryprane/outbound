ALTER TABLE "MailAccount"
ADD COLUMN "zohoAccountId" TEXT,
ADD COLUMN "zohoRegion" TEXT,
ADD COLUMN "zohoAccessToken" TEXT,
ADD COLUMN "zohoRefreshToken" TEXT,
ADD COLUMN "zohoTokenExpiry" TIMESTAMP(3),
ADD COLUMN "zohoMailboxMode" TEXT NOT NULL DEFAULT 'imap',
ADD COLUMN "zohoLastTokenRefreshAt" TIMESTAMP(3),
ADD COLUMN "zohoAuthError" TEXT;
