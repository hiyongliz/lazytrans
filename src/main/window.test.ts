import { describe, expect, it, vi } from 'vitest'

import {
  createTranslateWindow,
  readCurrentManualInputText,
  sendTranslationState,
  showTranslateWindow
} from './window'

const browserWindowInstances = vi.hoisted(() => [] as Array<Record<string, unknown>>)
const BrowserWindowMock = vi.hoisted(() =>
  vi.fn().mockImplementation((options: Record<string, unknown>) => {
    const listeners = new Map<string, (...args: unknown[]) => void>()
    const window = {
      options,
      listeners,
      setAlwaysOnTop: vi.fn(),
      setVisibleOnAllWorkspaces: vi.fn(),
      loadURL: vi.fn(),
      loadFile: vi.fn(),
      hide: vi.fn(),
      setBounds: vi.fn(),
      getBounds: vi.fn(() => ({ x: 10, y: 20, width: 460, height: 520 })),
      isDestroyed: vi.fn(() => false),
      on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
        listeners.set(event, callback)
      }),
      webContents: {
        on: vi.fn()
      }
    }
    browserWindowInstances.push(window)
    return window
  })
)

vi.mock('electron', () => ({
  BrowserWindow: BrowserWindowMock,
  screen: {
    getCursorScreenPoint: vi.fn(() => ({ x: 300, y: 200 })),
    getDisplayNearestPoint: vi.fn(() => ({
      workArea: {
        x: 0,
        y: 0,
        width: 1440,
        height: 900
      }
    }))
  }
}))

describe('translate window lifecycle', () => {
  it('hides instead of closing so the app keeps running in the background', () => {
    browserWindowInstances.length = 0
    const window = createTranslateWindow() as never as {
      hide: ReturnType<typeof vi.fn>
      listeners: Map<string, (event: { preventDefault(): void }) => void>
    }
    const event = {
      preventDefault: vi.fn()
    }

    window.listeners.get('close')?.(event)

    expect(event.preventDefault).toHaveBeenCalled()
    expect(window.hide).toHaveBeenCalled()
  })

  it('allows closing when the app is quitting', () => {
    browserWindowInstances.length = 0
    const window = createTranslateWindow({
      shouldHideOnClose: () => false
    }) as never as {
      hide: ReturnType<typeof vi.fn>
      listeners: Map<string, (event: { preventDefault(): void }) => void>
    }
    const event = {
      preventDefault: vi.fn()
    }

    window.listeners.get('close')?.(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(window.hide).not.toHaveBeenCalled()
  })

  it('applies initialBounds to the window when provided', () => {
    browserWindowInstances.length = 0
    const window = createTranslateWindow({
      initialBounds: { x: 200, y: 300, width: 500, height: 600 }
    }) as never as {
      setBounds: ReturnType<typeof vi.fn>
    }

    expect(window.setBounds).toHaveBeenCalledWith({
      x: 200,
      y: 300,
      width: 500,
      height: 600
    })
  })

  it('invokes onBoundsChange when the user resizes or moves the window', () => {
    browserWindowInstances.length = 0
    const onBoundsChange = vi.fn()
    const window = createTranslateWindow({
      onBoundsChange
    }) as never as {
      listeners: Map<string, () => void>
      getBounds: ReturnType<typeof vi.fn>
    }

    window.getBounds.mockReturnValue({ x: 5, y: 6, width: 100, height: 200 })
    window.listeners.get('resize')?.()
    expect(onBoundsChange).toHaveBeenCalledWith({
      x: 5,
      y: 6,
      width: 100,
      height: 200
    })

    window.getBounds.mockReturnValue({ x: 7, y: 8, width: 100, height: 200 })
    window.listeners.get('move')?.()
    expect(onBoundsChange).toHaveBeenCalledTimes(2)
  })
})

describe('translate window display', () => {
  it('restores and raises the window without stealing focus while keeping controls interactive', () => {
    const window = {
      isDestroyed: vi.fn(() => false),
      isMinimized: vi.fn(() => true),
      restore: vi.fn(),
      setBounds: vi.fn(),
      setFocusable: vi.fn(),
      setAlwaysOnTop: vi.fn(),
      showInactive: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      moveTop: vi.fn(),
      isVisible: vi.fn(() => true),
      getBounds: vi.fn(() => ({ x: 70, y: 218, width: 460, height: 520 }))
    }

    showTranslateWindow(window as never)

    expect(window.restore).toHaveBeenCalled()
    expect(window.setBounds).toHaveBeenCalledWith({
      x: 70,
      y: 218,
      width: 460,
      height: 520
    })
    expect(window.setFocusable).toHaveBeenCalledWith(true)
    expect(window.setAlwaysOnTop).toHaveBeenCalledWith(true, 'floating')
    expect(window.showInactive).toHaveBeenCalled()
    expect(window.show).not.toHaveBeenCalled()
    expect(window.focus).not.toHaveBeenCalled()
    expect(window.moveTop).toHaveBeenCalled()
  })

  it('does not steal focus in passive display mode even if showInactive reports hidden', () => {
    const window = {
      isDestroyed: vi.fn(() => false),
      isMinimized: vi.fn(() => false),
      restore: vi.fn(),
      setBounds: vi.fn(),
      setFocusable: vi.fn(),
      setAlwaysOnTop: vi.fn(),
      showInactive: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      moveTop: vi.fn(),
      isVisible: vi.fn(() => false),
      getBounds: vi.fn(() => ({ x: 70, y: 218, width: 460, height: 520 }))
    }

    showTranslateWindow(window as never)

    expect(window.showInactive).toHaveBeenCalled()
    expect(window.show).not.toHaveBeenCalled()
  })

  it('can focus the window for manual text entry after selection capture fails', () => {
    const window = {
      isDestroyed: vi.fn(() => false),
      isMinimized: vi.fn(() => false),
      restore: vi.fn(),
      setBounds: vi.fn(),
      setFocusable: vi.fn(),
      setAlwaysOnTop: vi.fn(),
      showInactive: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      moveTop: vi.fn(),
      isVisible: vi.fn(() => true),
      getBounds: vi.fn(() => ({ x: 70, y: 218, width: 460, height: 520 }))
    }

    showTranslateWindow(window as never, { focus: true })

    expect(window.setFocusable).toHaveBeenCalledWith(true)
    expect(window.show).toHaveBeenCalled()
    expect(window.focus).toHaveBeenCalled()
    expect(window.showInactive).not.toHaveBeenCalled()
  })

  it('can focus the visible window without repositioning it', () => {
    const window = {
      isDestroyed: vi.fn(() => false),
      isMinimized: vi.fn(() => false),
      restore: vi.fn(),
      setBounds: vi.fn(),
      setFocusable: vi.fn(),
      setAlwaysOnTop: vi.fn(),
      showInactive: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      moveTop: vi.fn(),
      isVisible: vi.fn(() => true),
      getBounds: vi.fn(() => ({ x: 422, y: 441, width: 460, height: 520 }))
    }

    showTranslateWindow(window as never, { focus: true, reposition: false })

    expect(window.setBounds).not.toHaveBeenCalled()
    expect(window.show).toHaveBeenCalled()
    expect(window.focus).toHaveBeenCalled()
  })
})

describe('translation state delivery', () => {
  it('sends state immediately when the renderer is ready', () => {
    const sendMock = vi.fn()
    const window = {
      webContents: {
        isLoading: vi.fn(() => false),
        send: sendMock
      }
    }

    sendTranslationState(window as never, {
      status: 'idle',
      sourceText: '',
      translatedText: '',
      errorMessage: ''
    })

    expect(sendMock).toHaveBeenCalledWith(
      'translation:update',
      expect.objectContaining({
        status: 'idle'
      })
    )
  })

  it('keeps only the latest state while the renderer is loading and flushes it when ready', () => {
    const sendMock = vi.fn()
    const onceMock = vi.fn((_event: string, callback: () => void) => {
      onceMock.callback = callback
    }) as ReturnType<typeof vi.fn> & { callback?: () => void }
    const window = {
      webContents: {
        isLoading: vi.fn(() => true),
        once: onceMock,
        send: sendMock
      }
    }

    sendTranslationState(window as never, {
      status: 'loading',
      sourceText: '',
      translatedText: '',
      errorMessage: ''
    })
    sendTranslationState(window as never, {
      status: 'success',
      sourceText: 'hello',
      translatedText: '你好',
      errorMessage: ''
    })

    expect(sendMock).not.toHaveBeenCalled()
    expect(onceMock).toHaveBeenCalledTimes(1)

    window.webContents.isLoading.mockReturnValue(false)
    onceMock.callback?.()

    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith(
      'translation:update',
      expect.objectContaining({
        status: 'success',
        translatedText: '你好'
      })
    )
  })
})

describe('manual input reading', () => {
  it('reads current textarea value directly from the renderer', async () => {
    const window = {
      webContents: {
        executeJavaScript: vi.fn(async () => ' live input ')
      }
    }

    await expect(readCurrentManualInputText(window as never)).resolves.toBe(' live input ')
    expect(window.webContents.executeJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('data-manual-input')
    )
  })

  it('returns empty text when the renderer cannot be queried', async () => {
    const window = {
      webContents: {
        executeJavaScript: vi.fn(async () => {
          throw new Error('renderer not ready')
        })
      }
    }

    await expect(readCurrentManualInputText(window as never)).resolves.toBe('')
  })
})
