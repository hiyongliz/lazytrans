import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  appendHistory,
  createHistoryEntry,
  readHistory,
  writeHistory,
  type HistoryEntry
} from './history'

describe('translation history', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'lazytrans-history-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('returns an empty list when no history file exists', () => {
    expect(readHistory(join(tempDir, 'history.json'))).toEqual([])
  })

  it('round-trips entries through write and read atomically', () => {
    const path = join(tempDir, 'history.json')
    const entry = createHistoryEntry({
      sourceText: 'hello',
      translatedText: '你好',
      model: 'gpt-4.1-mini',
      baseUrl: 'https://api.openai.com/v1',
      now: 1_700_000_000_000
    })

    writeHistory(path, [entry])

    expect(readHistory(path)).toEqual([entry])
  })

  it('promotes existing entries to the head when the same source+model+baseUrl is appended again', () => {
    const oldest = createHistoryEntry({
      sourceText: 'hello',
      translatedText: '你好',
      model: 'gpt-4.1-mini',
      baseUrl: 'https://api.openai.com/v1',
      now: 1_700_000_000_000
    })
    const middle = createHistoryEntry({
      sourceText: 'world',
      translatedText: '世界',
      model: 'gpt-4.1-mini',
      baseUrl: 'https://api.openai.com/v1',
      now: 1_700_000_001_000
    })
    const next = createHistoryEntry({
      sourceText: 'hello',
      translatedText: '你好 v2',
      model: 'gpt-4.1-mini',
      baseUrl: 'https://api.openai.com/v1',
      now: 1_700_000_002_000
    })

    const appended = appendHistory([middle, oldest], next)

    expect(appended.map((entry) => entry.translatedText)).toEqual([
      '你好 v2',
      '世界'
    ])
    expect(appended).toHaveLength(2)
  })

  it('keeps separate entries when model or baseUrl differs', () => {
    const first = createHistoryEntry({
      sourceText: 'hello',
      translatedText: '你好',
      model: 'gpt-4.1-mini',
      baseUrl: 'https://api.openai.com/v1',
      now: 1
    })
    const second = createHistoryEntry({
      sourceText: 'hello',
      translatedText: 'Hallo',
      model: 'gpt-4o-mini',
      baseUrl: 'https://api.openai.com/v1',
      now: 2
    })
    const third = createHistoryEntry({
      sourceText: 'hello',
      translatedText: 'Bonjour',
      model: 'gpt-4.1-mini',
      baseUrl: 'https://proxy.example.com/v1',
      now: 3
    })

    let entries: HistoryEntry[] = []
    entries = appendHistory(entries, first)
    entries = appendHistory(entries, second)
    entries = appendHistory(entries, third)

    expect(entries).toHaveLength(3)
  })

  it('caps total history at 50 entries by dropping the oldest', () => {
    let entries: HistoryEntry[] = []
    for (let index = 0; index < 60; index += 1) {
      entries = appendHistory(
        entries,
        createHistoryEntry({
          sourceText: `text-${index}`,
          translatedText: `t-${index}`,
          model: 'gpt-4.1-mini',
          baseUrl: 'https://api.openai.com/v1',
          now: index
        })
      )
    }

    expect(entries).toHaveLength(50)
    expect(entries[0]?.sourceText).toBe('text-59')
    expect(entries[entries.length - 1]?.sourceText).toBe('text-10')
  })

  it('treats a corrupted history file as empty', () => {
    const path = join(tempDir, 'history.json')
    writeFileSync(path, '{not valid json')

    expect(readHistory(path)).toEqual([])
  })

  it('drops entries with missing or malformed fields', () => {
    const path = join(tempDir, 'history.json')
    writeFileSync(
      path,
      JSON.stringify([
        {
          id: 'good',
          sourceText: 'hello',
          translatedText: '你好',
          model: 'gpt-4.1-mini',
          baseUrl: 'https://api.openai.com/v1',
          createdAt: 1
        },
        { id: 'no-source', translatedText: 'x' },
        null,
        'string'
      ])
    )

    const entries = readHistory(path)
    expect(entries.map((entry) => entry.id)).toEqual(['good'])
  })
})
