import { clipboard } from 'electron'

import { getSelectedText } from './selection'
import { translateTextStream } from './translator'
import type { TranslationState } from './window'

export interface TranslateFlowWindow {
  show(focus?: boolean): void
  sendState(state: TranslationState): void
}

interface SelectionTranslateFlowOptions {
  manualInputText?: string
  beforeCopySelection?: () => void | Promise<void>
  signal?: AbortSignal
}

export async function runSelectionTranslateFlow(
  window: TranslateFlowWindow,
  options: SelectionTranslateFlowOptions = {}
): Promise<void> {
  window.show(false)
  window.sendState({
    status: 'loading',
    phase: 'reading-selection',
    sourceText: '',
    translatedText: '',
    errorMessage: '正在读取选中文本...'
  })

  const sourceText = await getSelectedText({
    beforeCopy: options.beforeCopySelection
  })
  console.info(`Selected text captured: length=${sourceText.length}`)
  window.show(true)

  if (sourceText) {
    await translateSourceText(window, sourceText, options.signal)
    return
  }

  const manualInputText = options.manualInputText?.trim()
  if (manualInputText) {
    await translateSourceText(window, manualInputText, options.signal)
    return
  }

  if (!sourceText) {
    const clipboardText = clipboard.readText().trim()
    window.sendState({
      status: 'empty',
      sourceText: '',
      translatedText: '',
      errorMessage: clipboardText ? '' : '没有获取到选中文本',
      manualInputText: clipboardText
    })
    return
  }
}

async function translateSourceText(
  window: TranslateFlowWindow,
  sourceText: string,
  signal?: AbortSignal
): Promise<void> {
  window.sendState({
    status: 'loading',
    phase: 'translating',
    sourceText,
    translatedText: '',
    errorMessage: ''
  })

  let streamedText = ''
  const slowTimer = setTimeout(() => {
    if (streamedText || signal?.aborted) return
    window.sendState({
      status: 'loading',
      phase: 'translating',
      sourceText,
      translatedText: '',
      errorMessage: '请求较慢，正在等待模型响应...'
    })
  }, 3200)

  let translatedText: string
  try {
    translatedText = await translateTextStream(sourceText, {
      signal,
      onDelta: (delta) => {
        streamedText += delta
        window.sendState({
          status: 'loading',
          phase: 'translating',
          sourceText,
          translatedText: streamedText,
          errorMessage: ''
        })
      }
    })
  } finally {
    clearTimeout(slowTimer)
  }

  window.sendState({
    status: 'success',
    sourceText,
    translatedText,
    errorMessage: ''
  })
}
