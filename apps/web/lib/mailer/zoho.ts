import nodemailer from 'nodemailer'
import { decrypt } from '@/lib/encryption'
import { prisma } from '@/lib/prisma'

/**
 * Creates a Nodemailer transporter for a Zoho SMTP account.
 * Decrypts the stored password before use.
 */
export async function createZohoTransport(mailAccountId: string) {
  const account = await prisma.mailAccount.findUnique({
    where: { id: mailAccountId },
  })

  if (!account || account.type !== 'zoho') {
    throw new Error('Zoho mail account not found')
  }

  if (!account.smtpHost || !account.smtpPort || !account.smtpPassword) {
    throw new Error('Zoho SMTP credentials incomplete')
  }

  const password = decrypt(account.smtpPassword)

  const transporter = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpPort === 465,
    auth: {
      user: account.email,
      pass: password,
    },
  })

  return { transporter, account }
}

/**
 * Test a Zoho SMTP connection without saving to DB.
 */
export async function testZohoConnection(options: {
  host: string
  port: number
  email: string
  password: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.port === 465,
      auth: { user: options.email, pass: options.password },
    })
    await transporter.verify()
    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Connection failed',
    }
  }
}

/**
 * Send an email via Zoho SMTP.
 */
export async function sendZohoEmail(
  mailAccountId: string,
  to: string,
  subject: string,
  html: string
) {
  const { transporter, account } = await createZohoTransport(mailAccountId)

  const info = await transporter.sendMail({
    from: `"${account.displayName}" <${account.email}>`,
    to,
    subject,
    html,
  })

  return info
}
