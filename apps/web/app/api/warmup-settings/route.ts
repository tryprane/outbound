import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  DEFAULT_WARMUP_SETTINGS,
  WARMUP_SETTINGS_KEY,
  normalizeWarmupStageCounts,
  parseWarmupSettingsValue,
  serializeWarmupSettings,
} from '@/lib/warmupSettings'

async function readWarmupSettings() {
  const record = await prisma.systemSetting.findUnique({
    where: { key: WARMUP_SETTINGS_KEY },
  })

  return parseWarmupSettingsValue(record?.value)
}

export async function GET() {
  try {
    const settings = await readWarmupSettings()
    return NextResponse.json(settings)
  } catch (error) {
    console.error('[Warmup Settings GET]', error)
    return NextResponse.json(DEFAULT_WARMUP_SETTINGS, { status: 200 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<{
      globalEnabled: boolean
      stageCounts: number[]
    }>

    const nextSettings = {
      globalEnabled:
        typeof body.globalEnabled === 'boolean'
          ? body.globalEnabled
          : DEFAULT_WARMUP_SETTINGS.globalEnabled,
      stageCounts: normalizeWarmupStageCounts(body.stageCounts),
    }

    const record = await prisma.systemSetting.upsert({
      where: { key: WARMUP_SETTINGS_KEY },
      create: {
        key: WARMUP_SETTINGS_KEY,
        value: serializeWarmupSettings(nextSettings),
      },
      update: {
        value: serializeWarmupSettings(nextSettings),
      },
    })

    return NextResponse.json(parseWarmupSettingsValue(record.value))
  } catch (error) {
    console.error('[Warmup Settings PATCH]', error)
    return NextResponse.json({ error: 'Failed to update warmup settings' }, { status: 500 })
  }
}
