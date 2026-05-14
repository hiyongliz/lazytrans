import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  appendHistory,
  createHistoryEntry,
  readHistory,
  removeHistoryEntry,
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

  it('removes a single entry by id, leaving others intact', () => {
    const a = createHistoryEntry({
      sourceText: 'a',
      translatedText: '甲',
      model: 'm',
      baseUrl: 'u',
      now: 1
    })
    const b = createHistoryEntry({
      sourceText: 'b',
      translatedText: '乙',
      model: 'm',
      baseUrl: 'u',
      now: 2
    })

    expect(removeHistoryEntry([a, b], a.id)).toEqual([b])
    expect(removeHistoryEntry([a, b], 'missing')).toEqual([a, b])
  })

  it('keeps both direction variants for the same source text', () => {
    const zhEn = createHistoryEntry({
      sourceText: 'hello',
      translatedText: '你好',
      model: 'm',
      baseUrl: 'u',
      direction: 'zh-en',
      now: 1
    })
    const enZh = createHistoryEntry({
      sourceText: 'hello',
      translatedText: 'Hallo',
      model: 'm',
      baseUrl: 'u',
      direction: 'en-zh',
      now: 2
    })

    const entries = appendHistory([zhEn], enZh)
    expect(entries).toHaveLength(2)
    expect(entries.map((entry) => entry.direction)).toEqual(['en-zh', 'zh-en'])
  })

  it('replaces only the matching direction when the same source is appended again', () => {
    const first = createHistoryEntry({
      sourceText: 'hello',
      translatedText: '你好 v1',
      model: 'm',
      baseUrl: 'u',
      direction: 'en-zh',
      now: 1
    })
    const second = createHistoryEntry({
      sourceText: 'hello',
      translatedText: '你好 v2',
      model: 'm',
      baseUrl: 'u',
      direction: 'en-zh',
      now: 2
    })

    const entries = appendHistory([first], second)
    expect(entries).toHaveLength(1)
    expect(entries[0]?.translatedText).toBe('你好 v2')
  })

  it('defaults legacy entries without direction to auto', () => {
    const path = join(tempDir, 'history.json')
    writeFileSync(
      path,
      JSON.stringify([
        {
          id: 'legacy',
          sourceText: 'hi',
          translatedText: '嗨',
          model: 'm',
          baseUrl: 'u',
          createdAt: 1
        }
      ])
    )

    const entries = readHistory(path)
    expect(entries.map((entry) => entry.direction)).toEqual(['auto'])
  })
})
