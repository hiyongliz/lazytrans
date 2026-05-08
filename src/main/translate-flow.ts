import { clipboard } from 'electron'

import { getSelectedText } from './selection'
import { translateText } from './translator'
import type { TranslationState } from './window'

export interface TranslateFlowWindow {
  show(focus?: boolean): void
  sendState(state: TranslationState): void
}

interface SelectionTranslateFlowOptions {
  manualInputText?: string
  beforeCopySelection?: () => void | Promise<void>
}

export async function runSelectionTranslateFlow(
  window: TranslateFlowWindow,
  options: SelectionTranslateFlowOptions = {}
): Promise<void> {
  window.show(false)
  window.sendState({
    status: 'loading',
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
    await translateSourceText(window, sourceText)
    return
  }

  const manualInputText = options.manualInputText?.trim()
  if (manualInputText) {
    await translateSourceText(window, manualInputText)
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

async function translateSourceText(window: TranslateFlowWindow, sourceText: string): Promise<void> {
  window.sendState({
    status: 'loading',
    sourceText,
    translatedText: '',
    errorMessage: ''
  })

  const translatedText = await translateText(sourceText)

  window.sendState({
    status: 'success',
    sourceText,
    translatedText,
    errorMessage: ''
  })
}
