import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSelectedTextMock = vi.hoisted(() => vi.fn())
const translateTextMock = vi.hoisted(() => vi.fn())
const clipboardReadTextMock = vi.hoisted(() => vi.fn())

vi.mock('./selection', () => ({
  getSelectedText: getSelectedTextMock
}))

vi.mock('./translator', () => ({
  translateText: translateTextMock
}))

vi.mock('electron', () => ({
  clipboard: {
    readText: clipboardReadTextMock
  }
}))

import { runSelectionTranslateFlow } from './translate-flow'

describe('selection translate flow', () => {
  beforeEach(() => {
    getSelectedTextMock.mockReset()
    translateTextMock.mockReset()
    clipboardReadTextMock.mockReset()
  })

  it('shows a reading state before capturing selected text so the shortcut feels immediate', async () => {
    const events: string[] = []
    getSelectedTextMock.mockImplementation(async () => {
      events.push('capture-selection')
      return 'hello'
    })
    translateTextMock.mockResolvedValue('你好')

    await runSelectionTranslateFlow({
      show: () => events.push('show-window'),
      sendState: () => undefined
    })

    expect(events.slice(0, 2)).toEqual(['show-window', 'capture-selection'])
  })

  it('shows passively before capture and focuses again after capture because fallback copy may hide the window', async () => {
    const events: string[] = []
    getSelectedTextMock.mockImplementation(async (options?: { beforeCopy?: () => void }) => {
      events.push('capture-selection')
      options?.beforeCopy?.()
      return 'hello'
    })
    translateTextMock.mockResolvedValue('你好')

    await runSelectionTranslateFlow(
      {
        show: (focus = false) => events.push(`show-window:${focus}`),
        sendState: () => undefined
      },
      {
        beforeCopySelection: () => {
          events.push('hide-window')
        }
      }
    )

    expect(events).toEqual([
      'show-window:false',
      'capture-selection',
      'hide-window',
      'show-window:true'
    ])
  })

  it('focuses the window after selected text has been captured so the input remains editable', async () => {
    getSelectedTextMock.mockResolvedValue('hello')
    translateTextMock.mockResolvedValue('你好')
    const showMock = vi.fn()

    await runSelectionTranslateFlow({
      show: showMock,
      sendState: vi.fn()
    })

    expect(showMock).toHaveBeenCalledWith(true)
  })

  it('focuses the window only when no selected text was captured', async () => {
    getSelectedTextMock.mockResolvedValue('')
    clipboardReadTextMock.mockReturnValue('')
    const showMock = vi.fn()
    const sendStateMock = vi.fn()

    await runSelectionTranslateFlow({
      show: showMock,
      sendState: sendStateMock
    })

    expect(showMock).toHaveBeenCalledWith(true)
    expect(sendStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'empty'
      })
    )
  })

  it('prefills manual input with clipboard text when no selected text was captured', async () => {
    getSelectedTextMock.mockResolvedValue('')
    clipboardReadTextMock.mockReturnValue('clipboard text')
    const sendStateMock = vi.fn()

    await runSelectionTranslateFlow({
      show: vi.fn(),
      sendState: sendStateMock
    })

    expect(sendStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'empty',
        manualInputText: 'clipboard text'
      })
    )
  })

  it('does not show a missing selection error when clipboard text is available', async () => {
    getSelectedTextMock.mockResolvedValue('')
    clipboardReadTextMock.mockReturnValue('clipboard text')
    const sendStateMock = vi.fn()

    await runSelectionTranslateFlow({
      show: vi.fn(),
      sendState: sendStateMock
    })

    expect(sendStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: ''
      })
    )
  })

  it('uses selected text before current manual input when both are available', async () => {
    const sendStateMock = vi.fn()
    const showMock = vi.fn()
    getSelectedTextMock.mockResolvedValue('selected text')
    translateTextMock.mockResolvedValue('你好')

    await runSelectionTranslateFlow(
      {
        show: showMock,
        sendState: sendStateMock
      },
      {
        manualInputText: ' hello '
      }
    )

    expect(getSelectedTextMock).toHaveBeenCalled()
    expect(translateTextMock).toHaveBeenCalledWith('selected text')
  })

  it('translates current manual input when no selected text was captured', async () => {
    const sendStateMock = vi.fn()
    const showMock = vi.fn()
    getSelectedTextMock.mockResolvedValue('')
    translateTextMock.mockResolvedValue('你好')

    await runSelectionTranslateFlow(
      {
        show: showMock,
        sendState: sendStateMock
      },
      {
        manualInputText: ' hello '
      }
    )

    expect(showMock).toHaveBeenCalledWith(true)
    expect(sendStateMock).toHaveBeenCalledWith({
      status: 'loading',
      sourceText: 'hello',
      translatedText: '',
      errorMessage: ''
    })
    expect(translateTextMock).toHaveBeenCalledWith('hello')
    expect(sendStateMock).toHaveBeenCalledWith({
      status: 'success',
      sourceText: 'hello',
      translatedText: '你好',
      errorMessage: ''
    })
  })

  it('passes a before-copy callback to selection capture so the app window can get out of the way', async () => {
    const beforeCopySelection = vi.fn()
    getSelectedTextMock.mockResolvedValue('')
    clipboardReadTextMock.mockReturnValue('')

    await runSelectionTranslateFlow(
      {
        show: vi.fn(),
        sendState: vi.fn()
      },
      {
        beforeCopySelection
      }
    )

    expect(getSelectedTextMock).toHaveBeenCalledWith({
      beforeCopy: beforeCopySelection
    })
  })
})
