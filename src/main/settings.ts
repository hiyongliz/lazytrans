import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { DEFAULT_OPENAI_BASE_URL, DEFAULT_OPENAI_MODEL } from './translator'

export interface ApiSettings {
  apiKey: string
  baseUrl: string
  model: string
}

export type PartialApiSettings = Partial<ApiSettings>

export function readApiSettings(path: string): PartialApiSettings {
  if (!existsSync(path)) {
    return {}
  }

  try {
    return normalizeApiSettings(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return {}
  }
}

export function writeApiSettings(path: string, settings: ApiSettings): void {
  mkdirSync(dirname(path), { recursive: true })
  const normalized = normalizeApiSettings(settings)
  const tempPath = `${path}.tmp`

  writeFileSync(tempPath, `${JSON.stringify(normalized, null, 2)}\n`)
  renameSync(tempPath, path)
}

export function applyApiSettingsToEnv(
  settings: PartialApiSettings,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (settings.apiKey !== undefined) {
    env.TRANSLATE_API_KEY = settings.apiKey
  }

  if (settings.baseUrl !== undefined) {
    env.TRANSLATE_API_BASE_URL = settings.baseUrl
  }

  if (settings.model !== undefined) {
    env.TRANSLATE_MODEL = settings.model
  }
}

export function completeApiSettings(settings: PartialApiSettings): ApiSettings {
  return {
    apiKey: settings.apiKey?.trim() ?? '',
    baseUrl: settings.baseUrl?.trim() || DEFAULT_OPENAI_BASE_URL,
    model: settings.model?.trim() || DEFAULT_OPENAI_MODEL
  }
}

function normalizeApiSettings(value: unknown): PartialApiSettings {
  if (!value || typeof value !== 'object') {
    return {}
  }

  const settings = value as Partial<Record<keyof ApiSettings, unknown>>
  const normalized: PartialApiSettings = {}

  if (typeof settings.apiKey === 'string') {
    normalized.apiKey = settings.apiKey.trim()
  }

  if (typeof settings.baseUrl === 'string') {
    normalized.baseUrl = settings.baseUrl.trim()
  }

  if (typeof settings.model === 'string') {
    normalized.model = settings.model.trim()
  }

  return normalized
}
