import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_PREFERENCES,
  mergePreferences,
  promoteRecentModel,
  readPreferences,
  writePreferences
} from './preferences'

describe('preferences persistence', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'lazytrans-prefs-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('returns defaults when the preferences file does not exist', () => {
    expect(readPreferences(join(tempDir, 'prefs.json'))).toEqual(DEFAULT_PREFERENCES)
  })

  it('round-trips preferences through write and read', () => {
    const path = join(tempDir, 'prefs.json')
    writePreferences(path, {
      theme: 'dark',
      manualDirection: 'zh-en',
      recentModels: ['gpt-4.1-mini', 'gpt-4o-mini'],
      shortcutDowngradeAcknowledged: true
    })

    expect(readPreferences(path)).toEqual({
      theme: 'dark',
      manualDirection: 'zh-en',
      recentModels: ['gpt-4.1-mini', 'gpt-4o-mini'],
      shortcutDowngradeAcknowledged: true
    })
  })

  it('falls back to defaults when the file is corrupted', () => {
    const path = join(tempDir, 'prefs.json')
    writeFileSync(path, '{garbage')

    expect(readPreferences(path)).toEqual(DEFAULT_PREFERENCES)
  })

  it('keeps unknown fields out of the resulting preferences', () => {
    const path = join(tempDir, 'prefs.json')
    writeFileSync(
      path,
      JSON.stringify({
        theme: 'dark',
        unrelated: 'value'
      })
    )

    const prefs = readPreferences(path)
    expect(prefs.theme).toBe('dark')
    expect(prefs).not.toHaveProperty('unrelated')
  })

  it('drops invalid theme values silently and falls back to default', () => {
    const path = join(tempDir, 'prefs.json')
    writeFileSync(
      path,
      JSON.stringify({
        theme: 'neon-pink',
        manualDirection: 'auto'
      })
    )

    expect(readPreferences(path).theme).toBe('system')
  })
})

describe('preferences merge', () => {
  it('overrides only patched fields without losing untouched ones', () => {
    const current = {
      theme: 'system' as const,
      manualDirection: 'auto' as const,
      recentModels: ['m1'],
      shortcutDowngradeAcknowledged: false
    }

    const merged = mergePreferences(current, { theme: 'dark' })
    expect(merged).toEqual({
      theme: 'dark',
      manualDirection: 'auto',
      recentModels: ['m1'],
      shortcutDowngradeAcknowledged: false
    })
  })
})

describe('recent model promotion', () => {
  it('moves the model to the front when already present', () => {
    expect(promoteRecentModel(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c'])
  })

  it('inserts a new model at the front', () => {
    expect(promoteRecentModel(['a', 'b'], 'c')).toEqual(['c', 'a', 'b'])
  })

  it('caps the list at five entries', () => {
    expect(
      promoteRecentModel(['a', 'b', 'c', 'd', 'e'], 'f')
    ).toEqual(['f', 'a', 'b', 'c', 'd'])
  })

  it('ignores empty model names', () => {
    expect(promoteRecentModel(['a'], '  ')).toEqual(['a'])
  })
})
