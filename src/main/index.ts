import { dirname, join } from 'node:path'
import { app, globalShortcut, ipcMain } from 'electron'

import { loadDotEnvFiles } from './env'
import {
  applyApiSettingsToEnv,
  readApiSettings,
  writeApiSettings,
  type ApiSettings
} from './settings'
import { registerTranslateShortcut } from './shortcuts'
import { runSelectionTranslateFlow } from './translate-flow'
import { readTranslateConfig, translateText } from './translator'
import {
    createTranslateWindow,
    readCurrentManualInputText,
    sendTranslationState,
    showTranslateWindow,
    type TranslationState
} from './window'
import { ensureTranslateWindow } from './window-manager'

let translateWindow: Electron.BrowserWindow | null = null
let requestId = 0
let activeShortcutLabel = 'Option + D'
let isQuitting = false
let manualInputText = ''

const idleState: TranslationState = {
  status: 'idle',
  sourceText: '',
  translatedText: '',
  errorMessage: ''
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  console.error('LazyTrans is already running. Focusing the existing instance and quitting this one.')
  app.quit()
}

app.whenReady().then(() => {
  loadRuntimeEnv()

  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide()
  }

  translateWindow = getTranslateWindow()
  sendState(idleState)
  showTranslateWindow(translateWindow, { focus: true, reposition: false })

  const registration = registerTranslateShortcut(globalShortcut, () => {
    console.info(`Translate shortcut triggered: ${activeShortcutLabel}`)
    void handleTranslateShortcut()
  })

  if (registration.status === 'registered') {
    activeShortcutLabel = registration.label
    console.info(`Translate shortcut registered: ${registration.label}`)
    sendState(idleState)

    return
  }

  console.error(`Translate shortcut registration failed: ${registration.attemptedLabels.join(', ')}`)
  sendState({
    status: 'error',
    sourceText: '',
    translatedText: '',
    errorMessage: `快捷键注册失败：${registration.attemptedLabels.join(' / ')} 可能被系统或其他应用占用`
  })
})

app.on('second-instance', () => {
  translateWindow = getTranslateWindow()
  showTranslateWindow(translateWindow, { focus: true, reposition: false })
})

ipcMain.handle('translation:manual-translate', async (_event, text: string) => {
  await handleManualTranslate(text)
})

ipcMain.handle('translation:update-manual-input', (_event, text: string) => {
  manualInputText = text
})

ipcMain.handle('window:hide', () => {
  translateWindow?.hide()
})

ipcMain.handle('settings:get-api', () => {
  return getEffectiveApiSettings()
})

ipcMain.handle('settings:save-api', (_event, settings: unknown) => {
  const apiSettings = parseSubmittedApiSettings(settings)
  writeApiSettings(getApiSettingsPath(), apiSettings)
  applyApiSettingsToEnv(apiSettings)

  return getEffectiveApiSettings()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('activate', () => {
  translateWindow = getTranslateWindow()
  sendState(idleState)
})

async function handleTranslateShortcut(): Promise<void> {
  translateWindow = getTranslateWindow()

  const currentRequestId = ++requestId
  const currentManualInputText = await readCurrentManualInputText(translateWindow)

  try {
    await runSelectionTranslateFlow(
      {
        show: (focus = false) => {
          if (!translateWindow) {
            return
          }

          // Avoid the close-then-reopen flicker when the window is already on screen:
          // keep its position and don't steal focus — just update the content in place.
          const wasVisible = translateWindow.isVisible()
          showTranslateWindow(translateWindow, {
            focus: focus && !wasVisible,
            reposition: !wasVisible
          })
        },
        sendState: (state) => {
          sendLatestState(currentRequestId, state)
        }
      },
      {
        manualInputText: currentManualInputText || manualInputText
        // No beforeCopySelection: the BrowserWindow is created with focusable:false,
        // so the simulated ⌘C is delivered to the frontmost app without hiding ourselves.
      }
    )
  } catch (error) {
    showTranslateWindow(translateWindow)
    sendLatestState(currentRequestId, {
      status: 'error',
      sourceText: '',
      translatedText: '',
      errorMessage: formatErrorMessage(error)
    })
  }
}

async function handleManualTranslate(text: string): Promise<void> {
  translateWindow = getTranslateWindow()

  const sourceText = text.trim()
  if (!sourceText) {
    const currentRequestId = ++requestId
    sendLatestState(currentRequestId, {
      status: 'empty',
      sourceText: '',
      translatedText: '',
      errorMessage: '请输入要翻译的文本'
    })
    showTranslateWindow(translateWindow, { focus: true, reposition: false })
    return
  }

  const currentRequestId = ++requestId
  showTranslateWindow(translateWindow, { focus: true, reposition: false })
  sendState({
    status: 'loading',
    sourceText,
    translatedText: '',
    errorMessage: ''
  })

  try {
    const translatedText = await translateText(sourceText)

    sendLatestState(currentRequestId, {
      status: 'success',
      sourceText,
      translatedText,
      errorMessage: ''
    })
  } catch (error) {
    sendLatestState(currentRequestId, {
      status: 'error',
      sourceText,
      translatedText: '',
      errorMessage: formatErrorMessage(error)
    })
  }
}

function sendLatestState(stateRequestId: number, state: TranslationState): void {
  if (stateRequestId !== requestId) {
    return
  }

  sendState(state)
}

function sendState(state: TranslationState): void {
  if (!translateWindow) {
    return
  }

  sendTranslationState(translateWindow, {
    ...state,
    shortcutLabel: activeShortcutLabel
  })
}

function getTranslateWindow(): Electron.BrowserWindow {
  return ensureTranslateWindow(translateWindow, () => {
    const window = createTranslateWindow({
      shouldHideOnClose: () => !isQuitting
    })
    window.on('closed', () => {
      if (translateWindow === window) {
        translateWindow = null
      }
    })
    return window
  })
}

function loadRuntimeEnv(): void {
  loadDotEnvFiles([
    join(process.cwd(), '.env'),
    join(dirname(process.execPath), '.env'),
    join(process.resourcesPath, '.env'),
    join(app.getPath('userData'), '.env')
  ])
  applyApiSettingsToEnv(readApiSettings(getApiSettingsPath()))
}

function getApiSettingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function getEffectiveApiSettings(): ApiSettings {
  const config = readTranslateConfig()

  return {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model
  }
}

function parseSubmittedApiSettings(value: unknown): ApiSettings {
  if (!value || typeof value !== 'object') {
    throw new Error('API 设置格式无效')
  }

  const submitted = value as Partial<Record<keyof ApiSettings, unknown>>
  const apiKey = typeof submitted.apiKey === 'string' ? submitted.apiKey.trim() : ''
  const baseUrl = typeof submitted.baseUrl === 'string' ? submitted.baseUrl.trim() : ''
  const model = typeof submitted.model === 'string' ? submitted.model.trim() : ''

  if (!apiKey) {
    throw new Error('请输入 API Key')
  }

  if (!baseUrl) {
    throw new Error('请输入 API 地址')
  }

  try {
    new URL(baseUrl)
  } catch {
    throw new Error('API 地址格式无效')
  }

  if (!model) {
    throw new Error('请输入模型名称')
  }

  return {
    apiKey,
    baseUrl,
    model
  }
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
