import { describe, expect, it, vi } from 'vitest'

import { ensureTranslateWindow } from './window-manager'

describe('translate window manager', () => {
  it('reuses the existing live window instead of creating a second one', () => {
    const existingWindow = {
      isDestroyed: vi.fn(() => false)
    }
    const createWindow = vi.fn(() => ({
      isDestroyed: vi.fn(() => false)
    }))

    const window = ensureTranslateWindow(existingWindow as never, createWindow as never)

    expect(window).toBe(existingWindow)
    expect(createWindow).not.toHaveBeenCalled()
  })

  it('creates a new window when no live window exists', () => {
    const createdWindow = {
      isDestroyed: vi.fn(() => false)
    }
    const createWindow = vi.fn(() => createdWindow)

    const window = ensureTranslateWindow(null, createWindow as never)

    expect(window).toBe(createdWindow)
    expect(createWindow).toHaveBeenCalledTimes(1)
  })

  it('replaces a destroyed window', () => {
    const destroyedWindow = {
      isDestroyed: vi.fn(() => true)
    }
    const createdWindow = {
      isDestroyed: vi.fn(() => false)
    }
    const createWindow = vi.fn(() => createdWindow)

    const window = ensureTranslateWindow(destroyedWindow as never, createWindow as never)

    expect(window).toBe(createdWindow)
    expect(createWindow).toHaveBeenCalledTimes(1)
  })
})
