import nodemailer from 'nodemailer'
import { google } from 'googleapis'
import { prisma } from '~/lib/prisma'
import { decrypt, encrypt } from '~/lib/encryption'

export async function sendViaZoho(
  mailAccountId: string,
  to: string,
  subject: string,
  html: string
) {
  const account = await prisma.mailAccount.findUnique({ where: { id: mailAccountId } })
  if (!account || account.type !== 'zoho') throw new Error('Zoho account not found')
  if (!account.smtpHost || !account.smtpPort || !account.smtpPassword) {
    throw new Error('Zoho SMTP credentials incomplete')
  }

  const password = decrypt(account.smtpPassword)
  const transporter = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpPort === 465,
    auth: { user: account.email, pass: password },
  })

  const info = await transporter.sendMail({
    from: `"${account.displayName}" <${account.email}>`,
    to,
    subject,
    html,
  })

  return {
    providerMessageId: info.messageId || info.response || null,
  }
}

export async function sendViaGmail(
  mailAccountId: string,
  to: string,
  subject: string,
  html: string
) {
  const account = await prisma.mailAccount.findUnique({ where: { id: mailAccountId } })
  if (!account || account.type !== 'gmail') throw new Error('Gmail account not found')
  if (!account.accessToken || !account.refreshToken) throw new Error('Gmail tokens missing')

  const baseUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || 'http://localhost:3000'
  const redirectUri = `${baseUrl}/api/mail-accounts/gmail/callback`
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  )

  const isExpired = account.tokenExpiry && account.tokenExpiry < new Date()
  if (isExpired) {
    client.setCredentials({ refresh_token: account.refreshToken })
    const { credentials } = await client.refreshAccessToken()
    const newToken = credentials.access_token!
    const newExpiry = credentials.expiry_date ? new Date(credentials.expiry_date) : null
    await prisma.mailAccount.update({
      where: { id: mailAccountId },
      data: { accessToken: encrypt(newToken), tokenExpiry: newExpiry },
    })
    client.setCredentials({ access_token: newToken, refresh_token: account.refreshToken })
  } else {
    client.setCredentials({
      access_token: decrypt(account.accessToken),
      refresh_token: account.refreshToken,
    })
  }

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

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  })

  return {
    providerMessageId: response.data.id || response.data.threadId || null,
  }
}
