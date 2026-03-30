import { google } from 'googleapis'
import { decrypt, encrypt } from '@/lib/encryption'
import { prisma } from '@/lib/prisma'

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.NEXTAUTH_URL}/api/mail-accounts/gmail/callback`
)

/**
 * Generates the OAuth2 authorization URL for Gmail send + mailbox sync scopes.
 */
export function getGmailAuthUrl(): string {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
  })
}

/**
 * Exchanges an authorization code for tokens and saves the Gmail account to DB.
 */
export async function exchangeGmailCode(
  code: string
): Promise<{ email: string; accountId: string }> {
  const { tokens } = await oauth2Client.getToken(code)

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Missing tokens from Google OAuth response')
  }

  // Get email address from the profile
  oauth2Client.setCredentials(tokens)
  const gmail = google.oauth2({ version: 'v2', auth: oauth2Client })
  const userInfo = await gmail.userinfo.get()
  const email = userInfo.data.email!
  const name = userInfo.data.name || email

  // Calculate token expiry
  const tokenExpiry = tokens.expiry_date ? new Date(tokens.expiry_date) : null
  const existingAccount = await prisma.mailAccount.findUnique({
    where: { email },
    select: {
      id: true,
      warmupStatus: true,
      warmupAutoEnabled: true,
      warmupStartedAt: true,
    },
  })

  // Upsert the mail account (allow re-auth)
  const account = await prisma.mailAccount.upsert({
    where: { email },
    create: {
      type: 'gmail',
      email,
      displayName: name,
      accessToken: encrypt(tokens.access_token),
      refreshToken: tokens.refresh_token, // store unencrypted; encrypt if desired
      tokenExpiry,
      mailboxSyncStatus: 'idle',
      mailboxHealthStatus: 'cold',
      dailyLimit: 40,
      warmupStatus: 'WARMING',
      warmupStage: 0,
      warmupStartedAt: new Date(),
      recommendedDailyLimit: 5,
      warmupAutoEnabled: true,
      isActive: false,
    },
    update: {
      accessToken: encrypt(tokens.access_token),
      refreshToken: tokens.refresh_token,
      tokenExpiry,
      displayName: name,
    },
  })

  if (existingAccount?.warmupStatus === 'PAUSED') {
    await prisma.mailAccount.update({
      where: { id: account.id },
      data: {
        warmupStatus: 'WARMING',
        warmupPausedAt: null,
        warmupAutoEnabled: true,
        warmupStartedAt: existingAccount.warmupStartedAt ?? new Date(),
      },
    })
  }

  await prisma.warmupRecipient.upsert({
    where: { email: account.email },
    create: {
      email: account.email,
      name: account.displayName,
      isActive: true,
      isSystem: true,
      mailAccountId: account.id,
    },
    update: {
      name: account.displayName,
      isActive: true,
      isSystem: true,
      mailAccountId: account.id,
    },
  })

  return { email, accountId: account.id }
}

/**
 * Gets a valid Gmail OAuth2 client for a given mail account.
 * Auto-refreshes the access token if it's expired.
 */
export async function getGmailClient(mailAccountId: string) {
  const account = await prisma.mailAccount.findUnique({
    where: { id: mailAccountId },
  })

  if (!account || account.type !== 'gmail') {
    throw new Error('Gmail account not found')
  }
  if (!account.accessToken || !account.refreshToken) {
    throw new Error('Gmail tokens missing — please reconnect')
  }

  const accessToken = decrypt(account.accessToken)
  const isExpired =
    account.tokenExpiry && account.tokenExpiry < new Date()

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )

  if (isExpired) {
    // Refresh the access token
    client.setCredentials({ refresh_token: account.refreshToken })
    const { credentials } = await client.refreshAccessToken()
    const newToken = credentials.access_token!
    const newExpiry = credentials.expiry_date ? new Date(credentials.expiry_date) : null

    // Persist the new token
    await prisma.mailAccount.update({
      where: { id: mailAccountId },
      data: {
        accessToken: encrypt(newToken),
        tokenExpiry: newExpiry,
      },
    })
    client.setCredentials({ access_token: newToken })
  } else {
    client.setCredentials({ access_token: accessToken })
  }

  return { client, account }
}

/**
 * Send an email via Gmail API (OAuth2).
 */
export async function sendGmailEmail(
  mailAccountId: string,
  to: string,
  subject: string,
  html: string
) {
  const { client, account } = await getGmailClient(mailAccountId)
  const gmail = google.gmail({ version: 'v1', auth: client })

  const message = [
    `From: "${account.displayName}" <${account.email}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
  ].join('\n')

  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  })

  return res.data
}
