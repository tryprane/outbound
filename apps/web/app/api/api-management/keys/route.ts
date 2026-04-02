import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createWorkspaceApiKey } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

const CreateApiKeySchema = z.object({
  name: z.string().trim().min(1).max(80),
})

export async function GET() {
  try {
    const keys = await prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
        revokedAt: true,
        _count: {
          select: { apiDispatchRequests: true },
        },
      },
    })

    return NextResponse.json(keys)
  } catch (error) {
    console.error('[API Management Keys GET]', error)
    return NextResponse.json({ error: 'Failed to load API keys' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = CreateApiKeySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Valid key name is required' }, { status: 400 })
    }

    const generated = createWorkspaceApiKey()
    const apiKey = await prisma.apiKey.create({
      data: {
        name: parsed.data.name,
        keyPrefix: generated.prefix,
        keyHash: generated.hash,
      },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
        revokedAt: true,
      },
    })

    return NextResponse.json({
      apiKey,
      plaintextKey: generated.value,
    }, { status: 201 })
  } catch (error) {
    console.error('[API Management Keys POST]', error)
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'Missing key id' }, { status: 400 })
    }

    await prisma.apiKey.update({
      where: { id },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[API Management Keys DELETE]', error)
    return NextResponse.json({ error: 'Failed to revoke API key' }, { status: 500 })
  }
}
