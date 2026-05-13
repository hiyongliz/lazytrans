import { describe, expect, it } from 'vitest'

import {
  nextHistoryIndex,
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
