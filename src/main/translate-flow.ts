import { clipboard } from 'electron'

import { getSelectedText } from './selection'
import {
  fetchPhonetic,
  isSingleEnglishWord,
  translateTextStream,
  type TranslateDirection
} from './translator'
import type { TranslationState } from './window'

export interface TranslateFlowWindow {
  show(focus?: boolean): void
  sendState(state: TranslationState): void
}

interface SelectionTranslateFlowOptions {
  manualInputText?: string
  beforeCopySelection?: () => void | Promise<void>
  signal?: AbortSignal
  direction?: TranslateDirection
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
    await translateSourceText(window, sourceText, options.signal, options.direction)
    return
  }

  const manualInputText = options.manualInputText?.trim()
  if (manualInputText) {
    await translateSourceText(window, manualInputText, options.signal, options.direction)
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
  signal?: AbortSignal,
  direction?: TranslateDirection
): Promise<void> {
  window.sendState({
    status: 'loading',
    phase: 'translating',
    sourceText,
    translatedText: '',
    errorMessage: ''
  })

  let streamedText = ''
  let phonetic: string | undefined
  const slowTimer = setTimeout(() => {
    if (streamedText || signal?.aborted) return
    window.sendState({
      status: 'loading',
      phase: 'translating',
      sourceText,
      translatedText: '',
      errorMessage: '请求较慢，正在等待模型响应...',
      ...(phonetic !== undefined ? { phonetic } : {})
    })
  }, 3200)

  const phoneticPromise = isSingleEnglishWord(sourceText)
    ? fetchPhonetic(sourceText, { signal })
        .then((value) => {
          if (!value || signal?.aborted) return
          phonetic = value
          window.sendState({
            status: 'loading',
            phase: 'translating',
            sourceText,
            translatedText: streamedText,
            errorMessage: '',
            phonetic
          })
        })
        .catch(() => undefined)
    : Promise.resolve()

  let translatedText: string
  try {
    translatedText = await translateTextStream(sourceText, {
      signal,
      direction,
      onDelta: (delta) => {
        streamedText += delta
        window.sendState({
          status: 'loading',
          phase: 'translating',
          sourceText,
          translatedText: streamedText,
          errorMessage: '',
          ...(phonetic !== undefined ? { phonetic } : {})
        })
      }
    })
  } finally {
    clearTimeout(slowTimer)
  }

  await phoneticPromise

  window.sendState({
    status: 'success',
    sourceText,
    translatedText,
    errorMessage: '',
    ...(phonetic !== undefined ? { phonetic } : {})
  })
}
