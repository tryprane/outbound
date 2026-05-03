import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { loadMailboxMessageContent } from '@/lib/mailboxMessageContent'

export const dynamic = 'force-dynamic'

type RouteContext = {
  params: {
    id: string
  }
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const id = context.params.id?.trim()
    if (!id) {
      return NextResponse.json({ error: 'Mailbox message id is required' }, { status: 400 })
    }

    const message = await prisma.mailboxMessage.findUnique({
      where: { id },
      select: {
        id: true,
        providerMessageId: true,
        subject: true,
        fromEmail: true,
        toEmail: true,
        sentAt: true,
        receivedAt: true,
        metadata: true,
        mailAccount: true,
      },
    })

    if (!message) {
      return NextResponse.json({ error: 'Mailbox message not found' }, { status: 404 })
    }

    const content = await loadMailboxMessageContent(message.mailAccount, {
      providerMessageId: message.providerMessageId,
      metadata: (message.metadata as Record<string, unknown> | null) ?? null,
    })

    return NextResponse.json({
      id: message.id,
      subject: message.subject,
      fromEmail: message.fromEmail,
      toEmail: message.toEmail,
      sentAt: message.sentAt?.toISOString() || null,
      receivedAt: message.receivedAt?.toISOString() || null,
      html: content.html,
      text: content.text,
    })
  } catch (error) {
    console.error('[Inbox Message GET]', error)
    return NextResponse.json({ error: 'Failed to load message content' }, { status: 500 })
  }
}
