import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, dialog, globalShortcut, ipcMain, shell } from 'electron'

import { loadDotEnvFiles } from './env'
import {
  appendHistory,
  createHistoryEntry,
  readHistory,
  writeHistory,
  type HistoryEntry
} from './history'
import {
  DEFAULT_PREFERENCES,
  mergePreferences,
  promoteRecentModel,
  readPreferences,
  writePreferences,
  type Preferences
} from './preferences'
import {
  applyApiSettingsToEnv,
  completeApiSettings,
  readApiSettings,
  writeApiSettings,
  type ApiSettings
} from './settings'
import { registerTranslateShortcut } from './shortcuts'
import { toUserFacingTranslationError } from './translation-errors'
import { runSelectionTranslateFlow } from './translate-flow'
import {
  fetchPhonetic,
  isSingleEnglishWord,
  readTranslateConfig,
  testTranslateConnection,
  translateTextStream
} from './translator'
import { createTrayMenu, type TrayHistoryEntry, type TrayMenuHandle } from './tray'
import {
    createTranslateWindow,
    readCurrentManualInputText,
    sendTranslationState,
    showTranslateWindow,
    type TranslationState
} from './window'
import { ensureTranslateWindow } from './window-manager'
import { readWindowState, writeWindowState } from './window-state'

let translateWindow: Electron.BrowserWindow | null = null
let requestId = 0
let activeShortcutLabel = 'Option + D'
let isQuitting = false
let manualInputText = ''
let activeAbortController: AbortController | null = null
let historyEntries: HistoryEntry[] = []
let preferences: Preferences = { ...DEFAULT_PREFERENCES }
let trayHandle: TrayMenuHandle | null = null
let pendingBoundsWriteTimer: ReturnType<typeof setTimeout> | null = null
const BOUNDS_WRITE_DEBOUNCE_MS = 300

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
  historyEntries = readHistory(getHistoryPath())
  preferences = readPreferences(getPreferencesPath())

  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide()
  }

  translateWindow = getTranslateWindow()
  sendState(idleState)
  showTranslateWindow(translateWindow, { focus: true, reposition: false })

  setupTray()

  const registration = registerTranslateShortcut(globalShortcut, () => {
    console.info(`Translate shortcut triggered: ${activeShortcutLabel}`)
    void handleTranslateShortcut()
  })

  if (registration.status === 'registered') {
    activeShortcutLabel = registration.label
    console.info(`Translate shortcut registered: ${registration.label}`)
    sendState(idleState)

    if (registration.usedFallback && !preferences.shortcutDowngradeAcknowledged) {
      void showShortcutDowngradeDialog(registration.label)
    }

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

ipcMain.handle('translation:cancel', () => {
  handleCancelTranslation()
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

  preferences = mergePreferences(preferences, {
    recentModels: promoteRecentModel(preferences.recentModels, apiSettings.model)
  })
  try {
    writePreferences(getPreferencesPath(), preferences)
  } catch (error) {
    console.error(`Failed to persist preferences: ${formatErrorMessage(error)}`)
  }

  return getEffectiveApiSettings()
})

ipcMain.handle('settings:test-api', async (_event, settings: unknown) => {
  const apiSettings = parseSubmittedApiSettings(settings)
  await testTranslateConnection(apiSettings)

  return { ok: true }
})

ipcMain.handle('system:open-accessibility-settings', async () => {
  await shell.openExternal(
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
  )
})

ipcMain.handle('history:list', () => {
  return historyEntries.map(toPublicHistoryEntry)
})

ipcMain.handle('history:clear', () => {
  historyEntries = []
  writeHistory(getHistoryPath(), historyEntries)
  trayHandle?.refresh()
})

ipcMain.handle('history:translate-id', async (_event, id: unknown) => {
  if (typeof id !== 'string') {
    return
  }
  const entry = historyEntries.find((item) => item.id === id)
  if (!entry) {
    return
  }
  await handleManualTranslate(entry.sourceText)
})

ipcMain.handle('prefs:get', () => preferences)

ipcMain.handle('prefs:patch', (_event, patch: unknown) => {
  preferences = mergePreferences(preferences, normalizePreferencePatch(patch))
  try {
    writePreferences(getPreferencesPath(), preferences)
  } catch (error) {
    console.error(`Failed to persist preferences: ${formatErrorMessage(error)}`)
  }
  return preferences
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

  const { controller, id: currentRequestId } = beginTranslationRequest()
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
          if (state.status === 'success' && state.translatedText) {
            recordSuccessfulTranslation(state.sourceText, state.translatedText)
          }
          sendLatestState(currentRequestId, state)
        }
      },
      {
        manualInputText: currentManualInputText || manualInputText,
        signal: controller.signal,
        direction: preferences.manualDirection
        // No beforeCopySelection: the BrowserWindow is created with focusable:false,
        // so the simulated ⌘C is delivered to the frontmost app without hiding ourselves.
      }
    )
  } catch (error) {
    if (isAbortError(error)) {
      return
    }

    showTranslateWindow(translateWindow)
    sendLatestState(currentRequestId, buildErrorState(error))
  } finally {
    finishTranslationRequest(currentRequestId, controller)
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

  const { controller, id: currentRequestId } = beginTranslationRequest()
  showTranslateWindow(translateWindow, { focus: true, reposition: false })
  sendState({
    status: 'loading',
    phase: 'translating',
    sourceText,
    translatedText: '',
    errorMessage: ''
  })

  try {
    let streamedText = ''
    let phonetic: string | undefined

    const phoneticPromise = isSingleEnglishWord(sourceText)
      ? fetchPhonetic(sourceText, { signal: controller.signal })
          .then((value) => {
            if (!value || controller.signal.aborted) return
            phonetic = value
            sendLatestState(currentRequestId, {
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

    const translatedText = await translateTextStream(sourceText, {
      signal: controller.signal,
      direction: preferences.manualDirection,
      onDelta: (delta) => {
        streamedText += delta
        sendLatestState(currentRequestId, {
          status: 'loading',
          phase: 'translating',
          sourceText,
          translatedText: streamedText,
          errorMessage: '',
          ...(phonetic !== undefined ? { phonetic } : {})
        })
      }
    })

    await phoneticPromise

    if (
      !phonetic &&
      !controller.signal.aborted &&
      isSingleEnglishWord(translatedText)
    ) {
      try {
        const value = await fetchPhonetic(translatedText, {
          signal: controller.signal
        })
        if (value) phonetic = value
      } catch {
        // ignore — phonetic is best-effort
      }
    }

    sendLatestState(currentRequestId, {
      status: 'success',
      sourceText,
      translatedText,
      errorMessage: '',
      ...(phonetic !== undefined ? { phonetic } : {})
    })
    recordSuccessfulTranslation(sourceText, translatedText)
  } catch (error) {
    if (isAbortError(error)) {
      return
    }

    sendLatestState(currentRequestId, buildErrorState(error, sourceText))
  } finally {
    finishTranslationRequest(currentRequestId, controller)
  }
}

function handleCancelTranslation(): void {
  const controller = activeAbortController
  if (!controller || controller.signal.aborted) {
    return
  }

  controller.abort()
  activeAbortController = null
  requestId += 1
  sendState({
    status: 'cancelled',
    sourceText: manualInputText.trim(),
    translatedText: '',
    errorMessage: '已取消'
  })
}

function beginTranslationRequest(): { id: number; controller: AbortController } {
  activeAbortController?.abort()
  const controller = new AbortController()
  activeAbortController = controller

  return {
    id: ++requestId,
    controller
  }
}

function finishTranslationRequest(requestToFinish: number, controller: AbortController): void {
  if (requestToFinish === requestId && activeAbortController === controller) {
    activeAbortController = null
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
    const { bounds } = readWindowState(getWindowStatePath())
    const window = createTranslateWindow({
      shouldHideOnClose: () => !isQuitting,
      initialBounds: bounds,
      onBoundsChange: (nextBounds) => {
        scheduleBoundsWrite(nextBounds)
      }
    })
    window.on('closed', () => {
      if (translateWindow === window) {
        translateWindow = null
      }
    })
    return window
  })
}

function scheduleBoundsWrite(bounds: Electron.Rectangle): void {
  if (pendingBoundsWriteTimer) {
    clearTimeout(pendingBoundsWriteTimer)
  }
  pendingBoundsWriteTimer = setTimeout(() => {
    pendingBoundsWriteTimer = null
    try {
      writeWindowState(getWindowStatePath(), { bounds })
    } catch (error) {
      console.error(`Failed to persist window state: ${formatErrorMessage(error)}`)
    }
  }, BOUNDS_WRITE_DEBOUNCE_MS)
}

function recordSuccessfulTranslation(sourceText: string, translatedText: string): void {
  const config = readTranslateConfig()
  const entry = createHistoryEntry({
    sourceText,
    translatedText,
    model: config.model,
    baseUrl: config.baseUrl
  })
  historyEntries = appendHistory(historyEntries, entry)
  try {
    writeHistory(getHistoryPath(), historyEntries)
  } catch (error) {
    console.error(`Failed to persist history: ${formatErrorMessage(error)}`)
  }
  trayHandle?.refresh()
}

function toPublicHistoryEntry(entry: HistoryEntry): HistoryEntry {
  return { ...entry }
}

function setupTray(): void {
  try {
    trayHandle = createTrayMenu(getTrayIconPath(), {
      onShow: () => {
        translateWindow = getTranslateWindow()
        showTranslateWindow(translateWindow, { focus: true, reposition: false })
      },
      onSettings: () => {
        translateWindow = getTranslateWindow()
        showTranslateWindow(translateWindow, { focus: true, reposition: false })
        translateWindow.webContents.send('app:open-settings-request')
      },
      onTranslateHistoryEntry: (id) => {
        const entry = historyEntries.find((item) => item.id === id)
        if (!entry) {
          return
        }
        translateWindow = getTranslateWindow()
        showTranslateWindow(translateWindow, { focus: true, reposition: false })
        void handleManualTranslate(entry.sourceText)
      },
      onClearHistory: () => {
        historyEntries = []
        try {
          writeHistory(getHistoryPath(), historyEntries)
        } catch (error) {
          console.error(`Failed to clear history file: ${formatErrorMessage(error)}`)
        }
        trayHandle?.refresh()
      },
      onQuit: () => {
        app.quit()
      },
      getRecentHistory: () =>
        historyEntries.map<TrayHistoryEntry>((entry) => ({
          id: entry.id,
          sourceText: entry.sourceText
        }))
    })
  } catch (error) {
    console.error(`Failed to create tray: ${formatErrorMessage(error)}`)
  }
}

function getTrayIconPath(): string {
  const devIcon = join(app.getAppPath(), 'build/icon.icns')
  if (existsSync(devIcon)) {
    return devIcon
  }
  const resourcesIcon = join(process.resourcesPath, 'icon.icns')
  if (existsSync(resourcesIcon)) {
    return resourcesIcon
  }
  return ''
}

function getHistoryPath(): string {
  return join(app.getPath('userData'), 'history.json')
}

function getWindowStatePath(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

function getPreferencesPath(): string {
  return join(app.getPath('userData'), 'preferences.json')
}

async function showShortcutDowngradeDialog(label: string): Promise<void> {
  try {
    await dialog.showMessageBox({
      type: 'info',
      message: 'LazyTrans 已切换备用快捷键',
      detail: `Option + D 可能被系统或其他应用占用，已自动改用 ${label} 触发翻译。你也可以在系统设置中释放 Option + D 后重启 LazyTrans 恢复默认快捷键。`,
      buttons: ['知道了']
    })
  } catch (error) {
    console.error(`Failed to show shortcut downgrade dialog: ${formatErrorMessage(error)}`)
    return
  }

  preferences = mergePreferences(preferences, {
    shortcutDowngradeAcknowledged: true
  })
  try {
    writePreferences(getPreferencesPath(), preferences)
  } catch (error) {
    console.error(`Failed to persist downgrade ack: ${formatErrorMessage(error)}`)
  }
}

function normalizePreferencePatch(value: unknown): Partial<Preferences> {
  if (!value || typeof value !== 'object') {
    return {}
  }

  const raw = value as Partial<Record<keyof Preferences, unknown>>
  const patch: Partial<Preferences> = {}

  if (raw.theme === 'system' || raw.theme === 'light' || raw.theme === 'dark') {
    patch.theme = raw.theme
  }

  if (
    raw.manualDirection === 'auto' ||
    raw.manualDirection === 'zh-en' ||
    raw.manualDirection === 'en-zh'
  ) {
    patch.manualDirection = raw.manualDirection
  }

  if (Array.isArray(raw.recentModels)) {
    patch.recentModels = raw.recentModels
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  }

  if (typeof raw.shortcutDowngradeAcknowledged === 'boolean') {
    patch.shortcutDowngradeAcknowledged = raw.shortcutDowngradeAcknowledged
  }

  return patch
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
  const apiSettings = completeApiSettings({
    apiKey: typeof submitted.apiKey === 'string' ? submitted.apiKey : '',
    baseUrl: typeof submitted.baseUrl === 'string' ? submitted.baseUrl : '',
    model: typeof submitted.model === 'string' ? submitted.model : ''
  })

  if (!apiSettings.apiKey) {
    throw new Error('请输入 API Key')
  }

  if (!apiSettings.baseUrl) {
    throw new Error('请输入 API 地址')
  }

  try {
    new URL(apiSettings.baseUrl)
  } catch {
    throw new Error('API 地址格式无效')
  }

  if (!apiSettings.model) {
    throw new Error('请输入模型名称')
  }

  return apiSettings
}

function buildErrorState(error: unknown, sourceText = ''): TranslationState {
  const userFacingError = toUserFacingTranslationError(error)

  return {
    status: 'error',
    sourceText,
    translatedText: '',
    errorMessage: userFacingError.message,
    errorCode: userFacingError.code
  }
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'AbortError'
  }

  return error instanceof Error && error.name === 'AbortError'
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
