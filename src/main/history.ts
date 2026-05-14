import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import type { TranslateDirection } from './preferences'

export interface HistoryEntry {
  id: string
  sourceText: string
  translatedText: string
  model: string
  baseUrl: string
  direction: TranslateDirection
  createdAt: number
}

const HISTORY_MAX_ENTRIES = 50

export function readHistory(path: string): HistoryEntry[] {
  if (!existsSync(path)) {
    return []
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return normalizeHistory(parsed)
  } catch {
    return []
  }
}

export function writeHistory(path: string, entries: HistoryEntry[]): void {
  mkdirSync(dirname(path), { recursive: true })
  const tempPath = `${path}.tmp`
  writeFileSync(tempPath, `${JSON.stringify(entries, null, 2)}\n`)
  renameSync(tempPath, path)
}

export function appendHistory(
  current: HistoryEntry[],
  entry: HistoryEntry
): HistoryEntry[] {
  const filtered = current.filter(
    (existing) =>
      !(
        existing.sourceText === entry.sourceText &&
        existing.model === entry.model &&
        existing.baseUrl === entry.baseUrl &&
        existing.direction === entry.direction
      )
  )

  const next = [entry, ...filtered]
  if (next.length <= HISTORY_MAX_ENTRIES) {
    return next
  }

  return next.slice(0, HISTORY_MAX_ENTRIES)
}

export function clearHistory(): HistoryEntry[] {
  return []
}

export function removeHistoryEntry(
  current: HistoryEntry[],
  id: string
): HistoryEntry[] {
  return current.filter((entry) => entry.id !== id)
}

export function createHistoryEntry(input: {
  sourceText: string
  translatedText: string
  model: string
  baseUrl: string
  direction?: TranslateDirection
  now?: number
}): HistoryEntry {
  const createdAt = input.now ?? Date.now()
  return {
    id: `${createdAt}-${Math.random().toString(36).slice(2, 10)}`,
    sourceText: input.sourceText,
    translatedText: input.translatedText,
    model: input.model,
    baseUrl: input.baseUrl,
    direction: input.direction ?? 'auto',
    createdAt
  }
}

function normalizeHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) {
    return []
  }

  const entries: HistoryEntry[] = []
  for (const item of value) {
    const entry = normalizeEntry(item)
    if (entry) {
      entries.push(entry)
    }
  }

  return entries.slice(0, HISTORY_MAX_ENTRIES)
}

function normalizeEntry(value: unknown): HistoryEntry | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const raw = value as Partial<Record<keyof HistoryEntry, unknown>>
  if (
    typeof raw.id !== 'string' ||
    typeof raw.sourceText !== 'string' ||
    typeof raw.translatedText !== 'string' ||
    typeof raw.model !== 'string' ||
    typeof raw.baseUrl !== 'string' ||
    typeof raw.createdAt !== 'number'
  ) {
    return null
  }

  return {
    id: raw.id,
    sourceText: raw.sourceText,
    translatedText: raw.translatedText,
    model: raw.model,
    baseUrl: raw.baseUrl,
    direction: normalizeDirection(raw.direction),
    createdAt: raw.createdAt
  }
}

function normalizeDirection(value: unknown): TranslateDirection {
  if (value === 'zh-en' || value === 'en-zh' || value === 'auto') {
    return value
  }
  return 'auto'
}
