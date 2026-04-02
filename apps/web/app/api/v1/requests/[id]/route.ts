import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateWorkspaceApiKey } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

type Context = {
  params: {
    id: string
  }
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const apiKey = await authenticateWorkspaceApiKey(request.headers.get('authorization'))
    if (!apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const record = await prisma.apiDispatchRequest.findFirst({
      where: {
        id: context.params.id,
        apiKeyId: apiKey.id,
      },
      select: {
        id: true,
        channel: true,
        status: true,
        requestedTo: true,
        subject: true,
        errorMessage: true,
        providerMessageId: true,
        queuedAt: true,
        processedAt: true,
        createdAt: true,
        selectedMailAccount: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
        selectedWhatsAppAccount: {
          select: {
            id: true,
            displayName: true,
            phoneNumber: true,
          },
        },
      },
    })

    if (!record) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    return NextResponse.json(record)
  } catch (error) {
    console.error('[API V1 Request GET]', error)
    return NextResponse.json({ error: 'Failed to load request status' }, { status: 500 })
  }
}
