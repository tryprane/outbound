import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const limit = Math.max(1, Math.min(Number(request.nextUrl.searchParams.get('limit') || 50), 200))
    const requests = await prisma.apiDispatchRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        channel: true,
        status: true,
        requestedTo: true,
        subject: true,
        content: true,
        errorMessage: true,
        providerMessageId: true,
        queuedAt: true,
        processedAt: true,
        createdAt: true,
        apiKey: {
          select: {
            id: true,
            name: true,
            keyPrefix: true,
          },
        },
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

    return NextResponse.json(requests)
  } catch (error) {
    console.error('[API Management Requests GET]', error)
    return NextResponse.json({ error: 'Failed to load API request logs' }, { status: 500 })
  }
}
