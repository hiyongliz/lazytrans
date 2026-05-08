import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const execFileMock = vi.hoisted(() => vi.fn())
const clipboardState = vi.hoisted(() => ({ text: 'previous clipboard' }))

vi.mock('node:child_process', () => ({
  execFile: execFileMock
}))

vi.mock('electron', () => ({
  clipboard: {
    readText: vi.fn(() => clipboardState.text),
    writeText: vi.fn((text: string) => {
      clipboardState.text = text
    })
  }
}))

import { getSelectedText } from './selection'

describe('selection capture', () => {
  beforeEach(() => {
    clipboardState.text = 'previous clipboard'
    execFileMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses macOS accessibility selected text before falling back to clipboard copy', async () => {
    execFileMock.mockImplementation((_file, args, optionsOrCallback, maybeCallback) => {
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback
      expect(args).toEqual(expect.arrayContaining([expect.stringContaining('AXSelectedText')]))
      callback(null, 'accessibility text\n', '')
    })

    await expect(getSelectedText()).resolves.toBe('accessibility text')
    expect(clipboardState.text).toBe('previous clipboard')
    expect(execFileMock).toHaveBeenCalledTimes(1)
  })

  it('runs the copy command with a timeout so shortcut handling cannot hang indefinitely', async () => {
    execFileMock.mockImplementation((_file, args, optionsOrCallback, maybeCallback) => {
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback

      if (args.includes('tell application "System Events" to keystroke "c" using command down')) {
        clipboardState.text = 'copied text'
      }

      callback(null, '', '')
    })

    await expect(getSelectedText()).resolves.toBe('copied text')

    expect(execFileMock).toHaveBeenCalledWith(
      '/usr/bin/osascript',
      expect.any(Array),
      expect.objectContaining({
        timeout: expect.any(Number)
      }),
      expect.any(Function)
    )
  })

  it('can hide the translate window before using clipboard copy fallback', async () => {
    const beforeCopy = vi.fn()

    execFileMock.mockImplementation((_file, args, optionsOrCallback, maybeCallback) => {
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback

      if (args.includes('tell application "System Events" to keystroke "c" using command down')) {
        expect(beforeCopy).toHaveBeenCalled()
        clipboardState.text = 'copied text'
      }

      callback(null, '', '')
    })

    await expect(getSelectedText({ beforeCopy })).resolves.toBe('copied text')
  })

  it('returns copied text as soon as the clipboard changes instead of waiting a fixed delay', async () => {
    vi.useFakeTimers()

    execFileMock.mockImplementation((_file, args, optionsOrCallback, maybeCallback) => {
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback

      if (args.includes('tell application "System Events" to keystroke "c" using command down')) {
        setTimeout(() => {
          clipboardState.text = 'copied text'
        }, 20)
      }

      callback(null, '', '')
    })

    const selectedTextPromise = getSelectedText()
    await vi.advanceTimersByTimeAsync(120)

    await expect(selectedTextPromise).resolves.toBe('copied text')
  })
})
