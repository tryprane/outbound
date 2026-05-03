import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

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
        toEmail: true,
        subject: true,
        sentAt: true,
        body: true,
      },
    })

    if (!sentMail) {
      return NextResponse.json({ error: 'Sent mail not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: sentMail.id,
      toEmail: sentMail.toEmail,
      subject: sentMail.subject,
      sentAt: sentMail.sentAt.toISOString(),
      html: sentMail.body,
    })
  } catch (error) {
    console.error('[Sent Message GET]', error)
    return NextResponse.json({ error: 'Failed to load sent message' }, { status: 500 })
  }
}
