export const WARMUP_SETTINGS_KEY = 'warmup:settings'

export const DEFAULT_WARMUP_STAGE_COUNTS = [5, 8, 12, 18, 25, 35, 50, 65, 80, 100]

export interface WarmupSettings {
  globalEnabled: boolean
  stageCounts: number[]
}

export const DEFAULT_WARMUP_SETTINGS: WarmupSettings = {
  globalEnabled: true,
  stageCounts: DEFAULT_WARMUP_STAGE_COUNTS,
}

export function normalizeWarmupStageCounts(stageCounts?: unknown): number[] {
  if (!Array.isArray(stageCounts) || stageCounts.length === 0) {
    return DEFAULT_WARMUP_STAGE_COUNTS
  }

  return stageCounts
    .slice(0, DEFAULT_WARMUP_STAGE_COUNTS.length)
    .map((value, index) => {
      const parsed = Number(value)
      if (!Number.isFinite(parsed)) {
        return DEFAULT_WARMUP_STAGE_COUNTS[index]
      }
      return Math.max(1, Math.round(parsed))
    })
}

export function parseWarmupSettingsValue(value?: string | null): WarmupSettings {
  if (!value) return DEFAULT_WARMUP_SETTINGS

  try {
    const parsed = JSON.parse(value) as Partial<WarmupSettings>
    return {
      globalEnabled:
        typeof parsed.globalEnabled === 'boolean'
          ? parsed.globalEnabled
          : DEFAULT_WARMUP_SETTINGS.globalEnabled,
      stageCounts: normalizeWarmupStageCounts(parsed.stageCounts),
    }
  } catch {
    return DEFAULT_WARMUP_SETTINGS
  }
}

export function serializeWarmupSettings(settings: WarmupSettings): string {
  return JSON.stringify({
    globalEnabled: settings.globalEnabled,
    stageCounts: normalizeWarmupStageCounts(settings.stageCounts),
  })
}

export function recommendedLimitFromStage(stage: number, stageCounts = DEFAULT_WARMUP_STAGE_COUNTS): number {
  const plan = normalizeWarmupStageCounts(stageCounts)
  const index = Math.max(0, Math.min(stage, plan.length - 1))
  return plan[index]
}
