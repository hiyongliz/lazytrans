import { describe, expect, it } from 'vitest'

import { shouldAutoOpenSettings, shouldSyncManualInput } from './app-behavior'

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
