import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { authenticateWorkspaceApiKey } from '@/lib/apiAuth'
import { getApiDispatchQueue } from '@/lib/apiDispatchQueue'

export const dynamic = 'force-dynamic'

const SendEmailSchema = z.object({
  to: z.string().trim().email(),
  subject: z.string().trim().min(1).max(200),
  html: z.string().trim().optional(),
  text: z.string().trim().optional(),
  metadata: z.record(z.any()).optional(),
}).refine((value) => Boolean(value.html || value.text), {
  message: 'Either html or text is required',
  path: ['html'],
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

function getIdempotencyKey(request: NextRequest) {
  return request.headers.get('idempotency-key')?.trim() || null
}

function buildQueuedResponse(record: {
  id: string
  status?: string | null
  queuedAt: Date | null
  createdAt: Date
}) {
  return NextResponse.json(
    {
      requestId: record.id,
      status: record.status?.toLowerCase() || 'queued',
      queuedAt: record.queuedAt,
      createdAt: record.createdAt,
    },
    { status: 202 }
  )
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = await authenticateWorkspaceApiKey(request.headers.get('authorization'))
    if (!apiKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = SendEmailSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid email payload', issues: parsed.error.issues }, { status: 400 })
    }

    const idempotencyKey = getIdempotencyKey(request)
    if (idempotencyKey) {
      const existing = await prisma.apiDispatchRequest.findFirst({
        where: {
          apiKeyId: apiKey.id,
          idempotencyKey,
        },
        select: {
          id: true,
          status: true,
          queuedAt: true,
          createdAt: true,
        },
      })

      if (existing) {
        return buildQueuedResponse(existing)
      }
    }

    const content = parsed.data.html || textToHtml(parsed.data.text || '')
    const apiDispatchRequest = await prisma.apiDispatchRequest.create({
      data: {
        channel: 'EMAIL',
        status: 'QUEUED',
        requestedTo: parsed.data.to,
        subject: parsed.data.subject,
        content,
        metadata: parsed.data.metadata,
        apiKeyId: apiKey.id,
        idempotencyKey,
        queuedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        queuedAt: true,
        createdAt: true,
      },
    })

    try {
      await getApiDispatchQueue().add(
        'dispatch-api-request' as never,
        { apiDispatchRequestId: apiDispatchRequest.id } as never,
        { jobId: `api-dispatch-${apiDispatchRequest.id}` }
      )
    } catch (error) {
      await prisma.apiDispatchRequest.update({
        where: { id: apiDispatchRequest.id },
        data: {
          status: 'FAILED',
          errorMessage: `Queue enqueue failed: ${error instanceof Error ? error.message : String(error)}`,
          processedAt: new Date(),
        },
      })

      return NextResponse.json({ error: 'Queue unavailable' }, { status: 503 })
    }

    return buildQueuedResponse(apiDispatchRequest)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const apiKey = await authenticateWorkspaceApiKey(request.headers.get('authorization'))
      const idempotencyKey = getIdempotencyKey(request)
      if (apiKey && idempotencyKey) {
        const existing = await prisma.apiDispatchRequest.findFirst({
          where: {
            apiKeyId: apiKey.id,
            idempotencyKey,
          },
          select: {
            id: true,
            status: true,
            queuedAt: true,
            createdAt: true,
          },
        })

        if (existing) {
          return buildQueuedResponse(existing)
        }
      }
    }

    console.error('[API V1 Email Send POST]', error)
    return NextResponse.json({ error: 'Failed to queue email send request' }, { status: 500 })
  }
}
