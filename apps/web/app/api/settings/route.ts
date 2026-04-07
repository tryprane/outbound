import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WORKSPACE_SETTINGS_KEY = 'workspace:preferences'

type WorkspacePreferences = {
  defaultPageSize: number
  inboxPageSize: number
  whatsappInboxPageSize: number
  includeWarmupInInbox: boolean
}

const DEFAULT_WORKSPACE_PREFERENCES: WorkspacePreferences = {
  defaultPageSize: 25,
  inboxPageSize: 25,
  whatsappInboxPageSize: 20,
  includeWarmupInInbox: false,
}

function parsePreferences(value?: string | null): WorkspacePreferences {
  if (!value) return DEFAULT_WORKSPACE_PREFERENCES

  try {
    const parsed = JSON.parse(value) as Partial<WorkspacePreferences>
    return {
      defaultPageSize: Math.max(10, Math.min(100, Number(parsed.defaultPageSize) || DEFAULT_WORKSPACE_PREFERENCES.defaultPageSize)),
      inboxPageSize: Math.max(10, Math.min(100, Number(parsed.inboxPageSize) || DEFAULT_WORKSPACE_PREFERENCES.inboxPageSize)),
      whatsappInboxPageSize: Math.max(10, Math.min(100, Number(parsed.whatsappInboxPageSize) || DEFAULT_WORKSPACE_PREFERENCES.whatsappInboxPageSize)),
      includeWarmupInInbox:
        typeof parsed.includeWarmupInInbox === 'boolean'
          ? parsed.includeWarmupInInbox
          : DEFAULT_WORKSPACE_PREFERENCES.includeWarmupInInbox,
    }
  } catch {
    return DEFAULT_WORKSPACE_PREFERENCES
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    const sessionUserId = (session?.user as { id?: string } | undefined)?.id
    const user = sessionUserId
      ? await prisma.user.findUnique({
          where: { id: sessionUserId },
          select: { id: true, name: true, email: true, image: true },
        })
      : null
    const settings = await prisma.systemSetting.findUnique({
      where: { key: WORKSPACE_SETTINGS_KEY },
    })

    return NextResponse.json({
      profile: user,
      workspace: parsePreferences(settings?.value),
    })
  } catch (error) {
    console.error('[Settings GET]', error)
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const sessionUserId = (session?.user as { id?: string } | undefined)?.id
    const body = (await request.json()) as {
      profile?: {
        name?: string
        image?: string | null
      }
      workspace?: Partial<WorkspacePreferences>
    }

    let profile = null
    if (sessionUserId && body.profile) {
      profile = await prisma.user.update({
        where: { id: sessionUserId },
        data: {
          ...(body.profile.name !== undefined ? { name: body.profile.name.trim() || null } : {}),
          ...(body.profile.image !== undefined ? { image: body.profile.image?.trim() || null } : {}),
        },
        select: { id: true, name: true, email: true, image: true },
      })
    }

    let workspace = DEFAULT_WORKSPACE_PREFERENCES
    if (body.workspace) {
      const current = await prisma.systemSetting.findUnique({
        where: { key: WORKSPACE_SETTINGS_KEY },
      })
      workspace = parsePreferences(
        JSON.stringify({
          ...parsePreferences(current?.value),
          ...body.workspace,
        })
      )

      await prisma.systemSetting.upsert({
        where: { key: WORKSPACE_SETTINGS_KEY },
        create: {
          key: WORKSPACE_SETTINGS_KEY,
          value: JSON.stringify(workspace),
        },
        update: {
          value: JSON.stringify(workspace),
        },
      })
    } else {
      const current = await prisma.systemSetting.findUnique({
        where: { key: WORKSPACE_SETTINGS_KEY },
      })
      workspace = parsePreferences(current?.value)
    }

    return NextResponse.json({
      profile,
      workspace,
    })
  } catch (error) {
    console.error('[Settings PATCH]', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
