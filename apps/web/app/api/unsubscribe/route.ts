import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/unsubscribe — list opt-out emails
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const page  = Math.max(1, parseInt(sp.get('page')  || '1',  10))
    const limit = Math.min(200, parseInt(sp.get('limit') || '50', 10))

    const [list, total] = await Promise.all([
      prisma.unsubscribeList.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.unsubscribeList.count(),
    ])

    return NextResponse.json({ list, total, page, pages: Math.ceil(total / limit) || 1 })
  } catch (error) {
    console.error('[Unsubscribe GET]', error)
    return NextResponse.json({ error: 'Failed to fetch opt-out list' }, { status: 500 })
  }
}

// POST /api/unsubscribe — add an email to the opt-out list
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { email?: string }
    const email = (body.email || '').trim().toLowerCase()
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }

    const entry = await prisma.unsubscribeList.upsert({
      where: { email },
      create: { email },
      update: {},
    })

    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    console.error('[Unsubscribe POST]', error)
    return NextResponse.json({ error: 'Failed to add email' }, { status: 500 })
  }
}

// DELETE /api/unsubscribe?email=x — remove from opt-out list
export async function DELETE(request: NextRequest) {
  try {
    const email = (request.nextUrl.searchParams.get('email') || '').trim().toLowerCase()
    if (!email) {
      return NextResponse.json({ error: 'email query param required' }, { status: 400 })
    }

    await prisma.unsubscribeList.delete({ where: { email } }).catch(() => null)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Unsubscribe DELETE]', error)
    return NextResponse.json({ error: 'Failed to remove email' }, { status: 500 })
  }
}
