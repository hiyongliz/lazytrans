import { describe, expect, it } from 'vitest'

import {
  cycleDirection,
  displayDirection,
  errorActionsFor,
  filterHistory,
  formatHistoryTimestamp,
  nextHistoryIndex,
  shouldAutoOpenOnTransition,
  shouldAutoOpenSettings,
  shouldSyncManualInput
} from './app-behavior'

describe('renderer app behavior', () => {
  it('does not replace focused user edits with a stale translation update', () => {
    expect(
      shouldSyncManualInput({
        incomingText: 'clipboard text',
        currentText: 'draft I am typing',
        lastSyncedText: 'old clipboard text',
        isInputFocused: true,
        status: 'empty'
      })
    ).toBe(false)
  })

  it('does replace the input when a new translation starts from selected text', () => {
    expect(
      shouldSyncManualInput({
        incomingText: 'selected text',
        currentText: 'draft I am typing',
        lastSyncedText: 'old clipboard text',
        isInputFocused: true,
        status: 'loading'
      })
    ).toBe(true)
  })

  it('opens settings automatically for configuration errors', () => {
    expect(shouldAutoOpenSettings('missing-api-key')).toBe(true)
    expect(shouldAutoOpenSettings('auth-failed')).toBe(true)
    expect(shouldAutoOpenSettings('api-timeout')).toBe(false)
  })
})

describe('error actions', () => {
  it('suggests opening settings for credential errors', () => {
    expect(errorActionsFor('missing-api-key')).toEqual(['open-settings'])
    expect(errorActionsFor('auth-failed')).toEqual(['open-settings'])
  })

  it('suggests retry for transient errors', () => {
    expect(errorActionsFor('api-timeout')).toEqual(['retry'])
    expect(errorActionsFor('api-error')).toEqual(['retry'])
  })

  it('offers both retry and settings for rate limit and network errors', () => {
    expect(errorActionsFor('rate-limited')).toEqual(['retry', 'open-settings'])
    expect(errorActionsFor('network')).toEqual(['retry', 'open-settings'])
  })

  it('points the user to accessibility settings for selection-permission errors', () => {
    expect(errorActionsFor('selection-permission')).toEqual(['open-accessibility', 'retry'])
  })

  it('returns no actions when there is no error', () => {
    expect(errorActionsFor(undefined)).toEqual([])
  })
})

describe('history panel helpers', () => {
  const entries = [
    {
      id: 'a',
      sourceText: 'getUserById',
      translatedText: '根据 ID 获取用户',
      model: 'gpt-4.1-mini',
      baseUrl: 'https://api.openai.com/v1',
      direction: 'en-zh' as const,
      createdAt: 1
    },
    {
      id: 'b',
      sourceText: '世界',
      translatedText: 'world',
      model: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com/v1',
      direction: 'zh-en' as const,
      createdAt: 2
    }
  ]

  it('returns all entries when the query is empty or only whitespace', () => {
    expect(filterHistory(entries, '').map((entry) => entry.id)).toEqual(['a', 'b'])
    expect(filterHistory(entries, '   ').map((entry) => entry.id)).toEqual(['a', 'b'])
  })

  it('matches against source, translation and model fields, case-insensitively', () => {
    expect(filterHistory(entries, 'USER').map((entry) => entry.id)).toEqual(['a'])
    expect(filterHistory(entries, '世界').map((entry) => entry.id)).toEqual(['b'])
    expect(filterHistory(entries, 'deepseek').map((entry) => entry.id)).toEqual(['b'])
  })

  it('formats relative timestamps for recent entries and absolute date for older entries', () => {
    const now = new Date('2026-05-14T12:00:00Z').getTime()
    expect(formatHistoryTimestamp(now, now)).toBe('刚刚')
    expect(formatHistoryTimestamp(now - 5 * 60_000, now)).toBe('5 分钟前')
    expect(formatHistoryTimestamp(now - 3 * 3_600_000, now)).toBe('3 小时前')
    expect(formatHistoryTimestamp(now - 2 * 86_400_000, now)).toBe('2 天前')
    const longAgoSameYear = new Date('2026-01-02T00:00:00Z').getTime()
    expect(formatHistoryTimestamp(longAgoSameYear, now)).toMatch(/^\d{2}-\d{2}$/)
    const lastYear = new Date('2024-06-10T00:00:00Z').getTime()
    expect(formatHistoryTimestamp(lastYear, now)).toBe('2024-06-10')
  })
})

describe('history navigation', () => {
  it('returns null when history is empty', () => {
    expect(nextHistoryIndex(null, 'up', 0)).toBeNull()
    expect(nextHistoryIndex(null, 'down', 0)).toBeNull()
  })

  it('enters history at index 0 when pressing up from an unbrowsed input', () => {
    expect(nextHistoryIndex(null, 'up', 3)).toBe(0)
  })

  it('moves further back into history on subsequent up presses', () => {
    expect(nextHistoryIndex(0, 'up', 3)).toBe(1)
    expect(nextHistoryIndex(1, 'up', 3)).toBe(2)
  })

  it('clamps at the oldest entry when pressing up at the end of history', () => {
    expect(nextHistoryIndex(2, 'up', 3)).toBe(2)
  })

  it('exits history when pressing down from the most recent entry', () => {
    expect(nextHistoryIndex(0, 'down', 3)).toBeNull()
  })

  it('does nothing when pressing down before entering history', () => {
    expect(nextHistoryIndex(null, 'down', 3)).toBeNull()
  })

  it('moves toward the most recent entry on down presses', () => {
    expect(nextHistoryIndex(2, 'down', 3)).toBe(1)
    expect(nextHistoryIndex(1, 'down', 3)).toBe(0)
  })
})

describe('translate direction', () => {
  it('cycles auto → zh-en → en-zh → auto', () => {
    expect(cycleDirection('auto')).toBe('zh-en')
    expect(cycleDirection('zh-en')).toBe('en-zh')
    expect(cycleDirection('en-zh')).toBe('auto')
  })

  it('exposes a short human label for each direction', () => {
    expect(displayDirection('auto')).toBe('自动')
    expect(displayDirection('zh-en')).toBe('中→英')
    expect(displayDirection('en-zh')).toBe('英→中')
  })
})

describe('auto-open settings transition', () => {
  it('triggers when transitioning from no error or other error to missing-api-key', () => {
    expect(shouldAutoOpenOnTransition(undefined, 'missing-api-key')).toBe(true)
    expect(shouldAutoOpenOnTransition('network', 'missing-api-key')).toBe(true)
  })

  it('does not trigger again when the error code stays the same', () => {
    expect(shouldAutoOpenOnTransition('missing-api-key', 'missing-api-key')).toBe(false)
    expect(shouldAutoOpenOnTransition('auth-failed', 'auth-failed')).toBe(false)
  })

  it('never triggers for non-auth errors', () => {
    expect(shouldAutoOpenOnTransition(undefined, 'network')).toBe(false)
    expect(shouldAutoOpenOnTransition('missing-api-key', 'network')).toBe(false)
  })
})
