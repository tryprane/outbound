import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { loadSentMailReplyDetails } from '@/lib/sentMailReplyTracking'

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
      return NextResponse.json({ error: 'Sent mail id is required' }, { status: 400 })
    }

    const sentMail = await prisma.sentMail.findUnique({
      where: { id },
      select: {
        id: true,
        mailAccountId: true,
        toEmail: true,
        subject: true,
        sentAt: true,
        status: true,
      },
    })

    if (!sentMail) {
      return NextResponse.json({ error: 'Sent mail not found' }, { status: 404 })
    }

    if (sentMail.status !== 'sent') {
      return NextResponse.json({
        sentMailId: sentMail.id,
        hasReply: false,
        replies: [],
        message: 'Replies are only available for successfully sent mail.',
      })
    }

    const replyDetails = await loadSentMailReplyDetails([sentMail])
    const detail = replyDetails.get(sentMail.id)

    return NextResponse.json({
      sentMailId: sentMail.id,
      hasReply: Boolean(detail?.replyCount),
      repliedAt: detail?.repliedAt || null,
      replyCount: detail?.replyCount || 0,
      replies: detail?.replies || [],
    })
  } catch (error) {
    console.error('[Sent Reply GET]', error)
    return NextResponse.json({ error: 'Failed to load reply details' }, { status: 500 })
  }
}
