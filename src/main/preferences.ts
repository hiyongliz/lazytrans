import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export type ThemePreference = 'system' | 'light' | 'dark'
export type TranslateDirection = 'auto' | 'zh-en' | 'en-zh'

export interface Preferences {
  theme: ThemePreference
  manualDirection: TranslateDirection
  recentModels: string[]
  shortcutDowngradeAcknowledged: boolean
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  manualDirection: 'auto',
  recentModels: [],
  shortcutDowngradeAcknowledged: false
}

const RECENT_MODELS_MAX = 5

export function readPreferences(path: string): Preferences {
  if (!existsSync(path)) {
    return { ...DEFAULT_PREFERENCES }
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return mergePreferences(DEFAULT_PREFERENCES, normalizePreferences(parsed))
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

export function writePreferences(path: string, preferences: Preferences): void {
  mkdirSync(dirname(path), { recursive: true })
  const tempPath = `${path}.tmp`
  writeFileSync(tempPath, `${JSON.stringify(preferences, null, 2)}\n`)
  renameSync(tempPath, path)
}

export function mergePreferences(
  current: Preferences,
  patch: Partial<Preferences>
): Preferences {
  return {
    theme: patch.theme ?? current.theme,
    manualDirection: patch.manualDirection ?? current.manualDirection,
    recentModels: patch.recentModels ?? current.recentModels,
    shortcutDowngradeAcknowledged:
      patch.shortcutDowngradeAcknowledged ?? current.shortcutDowngradeAcknowledged
  }
}

export function promoteRecentModel(
  recentModels: string[],
  model: string
): string[] {
  const trimmed = model.trim()
  if (!trimmed) {
    return recentModels
  }
  const filtered = recentModels.filter((entry) => entry !== trimmed)
  return [trimmed, ...filtered].slice(0, RECENT_MODELS_MAX)
}

function normalizePreferences(value: unknown): Partial<Preferences> {
  if (!value || typeof value !== 'object') {
    return {}
  }

  const raw = value as Partial<Record<keyof Preferences, unknown>>
  const normalized: Partial<Preferences> = {}

  if (raw.theme === 'system' || raw.theme === 'light' || raw.theme === 'dark') {
    normalized.theme = raw.theme
  }

  if (
    raw.manualDirection === 'auto' ||
    raw.manualDirection === 'zh-en' ||
    raw.manualDirection === 'en-zh'
  ) {
    normalized.manualDirection = raw.manualDirection
  }

  if (Array.isArray(raw.recentModels)) {
    normalized.recentModels = raw.recentModels
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .slice(0, RECENT_MODELS_MAX)
  }

  if (typeof raw.shortcutDowngradeAcknowledged === 'boolean') {
    normalized.shortcutDowngradeAcknowledged = raw.shortcutDowngradeAcknowledged
  }

  return normalized
}
