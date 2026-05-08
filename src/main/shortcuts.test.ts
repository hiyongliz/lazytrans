import { describe, expect, it, vi } from 'vitest'

import { registerTranslateShortcut } from './shortcuts'

describe('translate shortcut registration', () => {
  it('uses Option + D when the primary shortcut registers successfully', () => {
    const callback = vi.fn()
    const globalShortcut = {
      register: vi.fn(() => true)
    }

    const result = registerTranslateShortcut(globalShortcut, callback)

    expect(result).toEqual({
      status: 'registered',
      accelerator: 'Alt+D',
      label: 'Option + D',
      usedFallback: false
    })
    expect(globalShortcut.register).toHaveBeenCalledTimes(1)
    expect(globalShortcut.register).toHaveBeenCalledWith('Alt+D', callback)
  })

  it('falls back to Command + Shift + D when Option + D is unavailable', () => {
    const callback = vi.fn()
    const globalShortcut = {
      register: vi.fn((accelerator: string) => accelerator === 'CommandOrControl+Shift+D')
    }

    const result = registerTranslateShortcut(globalShortcut, callback)

    expect(result).toEqual({
      status: 'registered',
      accelerator: 'CommandOrControl+Shift+D',
      label: 'Command + Shift + D',
      usedFallback: true
    })
    expect(globalShortcut.register).toHaveBeenCalledTimes(2)
  })

  it('reports a failure when no shortcut can be registered', () => {
    const callback = vi.fn()
    const globalShortcut = {
      register: vi.fn(() => false)
    }

    const result = registerTranslateShortcut(globalShortcut, callback)

    expect(result).toEqual({
      status: 'failed',
      attemptedLabels: ['Option + D', 'Command + Shift + D']
    })
  })
})
