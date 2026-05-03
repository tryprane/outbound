import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getMailQueue } from '@/lib/mailQueue'

export const dynamic = 'force-dynamic'

const SendMailSchema = z.object({
  mailAccountId: z.string().trim().min(1),
  recipients: z.array(z.string().trim().email()).min(1).max(100),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(50000),
})

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function textToHtml(text: string) {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  return normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br/>')}</p>`)
    .join('')
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = SendMailSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid send-mail payload', issues: parsed.error.issues }, { status: 400 })
    }

    const account = await prisma.mailAccount.findUnique({
      where: { id: parsed.data.mailAccountId },
      select: {
        id: true,
        email: true,
        displayName: true,
        dailyLimit: true,
        sentToday: true,
        isActive: true,
        warmupStatus: true,
        mailboxSyncStatus: true,
        mailboxHealthStatus: true,
      },
    })

    if (!account) {
      return NextResponse.json({ error: 'Sender account not found' }, { status: 404 })
    }

    if (!account.isActive || account.warmupStatus !== 'WARMED') {
      return NextResponse.json(
        { error: 'Only ACTIVE + WARMED mailboxes can be used for manual sending.' },
        { status: 400 }
      )
    }

    if (account.mailboxSyncStatus === 'error') {
      return NextResponse.json({ error: 'This mailbox has a sync error and is temporarily blocked.' }, { status: 400 })
    }

    if (account.mailboxHealthStatus === 'paused') {
      return NextResponse.json({ error: 'This mailbox is paused by mailbox health rules.' }, { status: 400 })
    }

    const remainingCapacity = Math.max(0, account.dailyLimit - account.sentToday)
    if (parsed.data.recipients.length > remainingCapacity) {
      return NextResponse.json(
        { error: `This sender only has ${remainingCapacity} send slot${remainingCapacity === 1 ? '' : 's'} left today.` },
        { status: 400 }
      )
    }

    const htmlBody = textToHtml(parsed.data.body)
    const queue = getMailQueue()
    const queued = parsed.data.recipients.map((toEmail) => {
      const trackingToken = crypto.randomUUID()
      return queue.add(
        'send-mail' as never,
        {
          campaignId: null,
          csvRowId: null,
          mailAccountId: account.id,
          apiDispatchRequestId: null,
          reservationKey: null,
          toEmail,
          subject: parsed.data.subject,
          body: htmlBody,
          trackingToken,
        } as never,
        {
          jobId: `manual-mail-${account.id}-${trackingToken}`,
        }
      )
    })

    await Promise.all(queued)

    return NextResponse.json({
      success: true,
      sender: {
        id: account.id,
        email: account.email,
        displayName: account.displayName,
      },
      queuedCount: parsed.data.recipients.length,
      recipients: parsed.data.recipients,
    })
  } catch (error) {
    console.error('[Send Mail POST]', error)
    return NextResponse.json({ error: 'Failed to queue manual email send' }, { status: 500 })
  }
}
