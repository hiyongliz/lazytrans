import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'

import type { ApiSettings } from './lib/types'
import type { HistoryEntry } from './lib/types'
import type { Preferences, PromptStyle, ThemePreference, TranslateDirection } from './lib/types'
import { PROVIDER_PRESETS } from './lib/providers'
import type { TranslationState } from './lib/types'
import {
  PRIMARY_DIRECTIONS,
  PROMPT_STYLE_OPTIONS,
  TARGET_LANGUAGES,
  acceleratorFromEvent,
  displayDirection,
  errorActionsFor,
  nextHistoryIndex,
  shouldAutoOpenOnTransition,
  shouldAutoOpenSettings,
  shouldSyncManualInput
} from './lib/app-behavior'
import { cancelSpeech, speak } from './lib/speech'
import { HistoryPanel } from '@/components/HistoryPanel'
import { SettingsPanel } from '@/components/SettingsPanel'
import { TitleBar } from '@/components/TitleBar'
import { TranslationInput } from '@/components/TranslationInput'
import { TranslationResult } from '@/components/TranslationResult'
import { Card } from '@/components/ui/card'

const initialState: TranslationState = {
  status: 'idle',
  sourceText: '',
  translatedText: '',
  errorMessage: ''
}

const emptyApiSettings: ApiSettings = {
  apiKey: '',
  baseUrl: '',
  model: ''
}

const initialPreferences: Preferences = {
  theme: 'system',
  manualDirection: 'auto',
  promptStyle: 'programmer',
  recentModels: [],
  shortcutDowngradeAcknowledged: false,
  autoHideOnBlur: true,
  customShortcut: null
}

type SettingsStatus =
  | 'idle'
  | 'loading'
  | 'testing'
  | 'saved'
  | 'tested'
  | 'preset-applied'
  | 'error'
type CopyStatus = 'idle' | 'translated' | 'source' | 'error'

const THEME_OPTIONS: ThemePreference[] = ['system', 'light', 'dark']

export default function App(): ReactElement {
  const [translation, setTranslation] = useState<TranslationState>(initialState)
  const [manualText, setManualText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState<ApiSettings>(emptyApiSettings)
  const [settingsStatus, setSettingsStatus] = useState<SettingsStatus>('idle')
  const [settingsMessage, setSettingsMessage] = useState('')
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const [preferences, setPreferences] = useState<Preferences>(initialPreferences)
  const [isThemePickerOpen, setIsThemePickerOpen] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState<'source' | 'translated' | null>(null)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [historyQuery, setHistoryQuery] = useState('')
  const [historyClearArmed, setHistoryClearArmed] = useState(false)
  const [isLangPickerOpen, setIsLangPickerOpen] = useState(false)
  const [isRecordingShortcut, setIsRecordingShortcut] = useState(false)
  const [localShortcutLabel, setLocalShortcutLabel] = useState<string | null>(null)
  const [exportMessage, setExportMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const apiKeyRef = useRef<HTMLInputElement>(null)
  const lastSyncedManualText = useRef('')
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previousErrorCode = useRef<TranslationState['errorCode']>(undefined)

  const shortcutLabel = localShortcutLabel ?? translation.shortcutLabel ?? 'Option + D'
  const trimmedManual = manualText.trim()
  const canSubmit =
    trimmedManual.length > 0 && translation.status !== 'loading' && !isSubmitting
  const isLoading = translation.status === 'loading'
  const settingsBusy = settingsStatus === 'loading' || settingsStatus === 'testing'
  const canRetry = !isLoading && Boolean(trimmedManual || translation.sourceText.trim())
  const canCopySource = Boolean(translation.sourceText.trim())
  const sourcePlayableText = (trimmedManual || translation.sourceText.trim())
  const canPlaySource = sourcePlayableText.length > 0
  const translatedPlayableText = translation.translatedText.trim()
  const canPlayTranslated =
    translation.status === 'success' && translatedPlayableText.length > 0
  const errorActions =
    translation.status === 'error' ? errorActionsFor(translation.errorCode) : []

  useEffect(() => {
    return window.lazyTrans.onTranslationUpdate(setTranslation)
  }, [])

  useEffect(() => {
    return window.lazyTrans.onOpenSettingsRequest(() => {
      setIsSettingsOpen(true)
    })
  }, [])

  useEffect(() => {
    void window.lazyTrans.listHistory().then((entries) => {
      setHistory(entries)
    })
  }, [])

  useEffect(() => {
    void window.lazyTrans.getPreferences().then((prefs) => {
      setPreferences(prefs)
    })
    void window.lazyTrans
      .getShortcutLabel()
      .then((label) => setLocalShortcutLabel(label))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const root = document.documentElement
    const applyTheme = (mode: 'dark' | 'light'): void => {
      root.classList.toggle('dark', mode === 'dark')
    }

    if (preferences.theme !== 'system') {
      applyTheme(preferences.theme === 'dark' ? 'dark' : 'light')
      return
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    applyTheme(mediaQuery.matches ? 'dark' : 'light')
    const handleChange = (event: MediaQueryListEvent): void => {
      applyTheme(event.matches ? 'dark' : 'light')
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [preferences.theme])

  useEffect(() => {
    if (translation.status !== 'success') return
    void window.lazyTrans.listHistory().then((entries) => {
      setHistory(entries)
    })
  }, [translation.status, translation.translatedText])

  useEffect(() => {
    void window.lazyTrans.updateManualInput(manualText)
  }, [manualText])

  useEffect(() => {
    const previousCode = previousErrorCode.current
    previousErrorCode.current = translation.errorCode

    if (!shouldAutoOpenOnTransition(previousCode, translation.errorCode)) return

    setIsSettingsOpen(true)
    setSettingsStatus('error')
    setSettingsMessage('请先补全 API 设置')
    requestAnimationFrame(() => {
      apiKeyRef.current?.focus()
    })
  }, [translation.errorCode])

  useEffect(() => {
    if (!isSettingsOpen) return

    let cancelled = false
    setSettingsStatus('loading')
    setSettingsMessage('')

    window.lazyTrans
      .getApiSettings()
      .then((settings) => {
        if (cancelled) return
        setSettingsDraft(settings)
        setSettingsStatus('idle')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setSettingsStatus('error')
        setSettingsMessage(formatErrorMessage(error))
      })

    return () => {
      cancelled = true
    }
  }, [isSettingsOpen])

  useEffect(() => {
    const next = translation.sourceText || translation.manualInputText
    const isInputFocused = document.activeElement === textareaRef.current

    if (
      shouldSyncManualInput({
        incomingText: next,
        currentText: manualText,
        lastSyncedText: lastSyncedManualText.current,
        isInputFocused,
        status: translation.status
      })
    ) {
      const nextText = next ?? ''
      setManualText(nextText)
      lastSyncedManualText.current = nextText
    }
    if (translation.status === 'empty' || translation.status === 'cancelled') {
      textareaRef.current?.focus()
    }
  }, [
    manualText,
    translation.manualInputText,
    translation.sourceText,
    translation.status
  ])

  useEffect(() => {
    if (!textareaRef.current) return
    textareaRef.current.style.height = '0px'
    const target = Math.max(72, Math.min(textareaRef.current.scrollHeight, 168))
    textareaRef.current.style.height = `${target}px`
  }, [manualText])

  useEffect(() => {
    setCopyStatus('idle')
    if (copyResetTimer.current) {
      clearTimeout(copyResetTimer.current)
      copyResetTimer.current = null
    }
  }, [translation.translatedText])

  useEffect(() => {
    return () => {
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current)
      cancelSpeech()
    }
  }, [])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false
    void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      void getCurrentWindow()
        .onFocusChanged(({ payload: focused }) => {
          if (focused) return
          if (!preferences.autoHideOnBlur) return
          if (isSettingsOpen || isHistoryOpen || isRecordingShortcut) return
          void window.lazyTrans.hideWindow()
        })
        .then((fn) => {
          if (cancelled) fn()
          else unlisten = fn
        })
    })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [preferences.autoHideOnBlur, isSettingsOpen, isHistoryOpen, isRecordingShortcut])

  useEffect(() => {
    const handleWindowKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (isRecordingShortcut) return
      event.preventDefault()
      if (historyClearArmed) {
        setHistoryClearArmed(false)
        return
      }
      if (isHistoryOpen) {
        setIsHistoryOpen(false)
        return
      }
      if (isSettingsOpen) {
        setIsSettingsOpen(false)
        return
      }
      closeWindow()
    }

    window.addEventListener('keydown', handleWindowKeyDown)
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown)
    }
  }, [historyClearArmed, isHistoryOpen, isSettingsOpen, isRecordingShortcut])

  const submitManualText = async (): Promise<void> => {
    if (!canSubmit) return
    setIsSubmitting(true)
    try {
      await window.lazyTrans.translateInput(manualText)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submitManualText()
      return
    }

    if (history.length === 0) return
    if (!event.metaKey) return

    if (event.key === 'ArrowUp') {
      const next = nextHistoryIndex(historyIndex, 'up', history.length)
      if (next === null || next === historyIndex) return
      event.preventDefault()
      setHistoryIndex(next)
      setManualText(history[next].sourceText)
      return
    }

    if (event.key === 'ArrowDown') {
      if (historyIndex === null) return
      const next = nextHistoryIndex(historyIndex, 'down', history.length)
      event.preventDefault()
      setHistoryIndex(next)
      setManualText(next === null ? '' : history[next].sourceText)
    }
  }

  const closeWindow = (event?: React.MouseEvent<HTMLButtonElement>): void => {
    event?.currentTarget.blur()
    void window.lazyTrans.hideWindow()
  }

  const updateSettingsDraft = (key: keyof ApiSettings, value: string): void => {
    setSettingsDraft((current) => ({ ...current, [key]: value }))
    setSettingsStatus('idle')
    setSettingsMessage('')
  }

  const applyProviderPreset = (presetId: string): void => {
    const preset = PROVIDER_PRESETS.find((item) => item.id === presetId)
    if (!preset) return
    const currentModel = settingsDraft.model.trim()
    const isUnsetOrPresetDefault =
      currentModel === '' ||
      PROVIDER_PRESETS.some((item) => item.defaultModel === currentModel)
    setSettingsDraft((current) => ({
      ...current,
      baseUrl: preset.baseUrl,
      model: isUnsetOrPresetDefault ? preset.defaultModel : current.model
    }))
    setSettingsStatus('preset-applied')
    setSettingsMessage(
      isUnsetOrPresetDefault
        ? preset.hint ?? `已套用 ${preset.name}，请填写 Key 后测试`
        : `已切换到 ${preset.name}，保留你的模型 "${currentModel}"`
    )
  }

  const saveApiSettings = async (): Promise<void> => {
    setSettingsStatus('loading')
    setSettingsMessage('')
    try {
      const saved = await window.lazyTrans.saveApiSettings(settingsDraft)
      setSettingsDraft(saved)
      setSettingsStatus('saved')
      setSettingsMessage('已保存')
      const prefs = await window.lazyTrans.getPreferences()
      setPreferences(prefs)
    } catch (error) {
      setSettingsStatus('error')
      setSettingsMessage(formatErrorMessage(error))
    }
  }

  const testApiSettings = async (): Promise<void> => {
    setSettingsStatus('testing')
    setSettingsMessage('')
    try {
      await window.lazyTrans.testApiSettings(settingsDraft)
      setSettingsStatus('tested')
      setSettingsMessage('连接正常')
    } catch (error) {
      setSettingsStatus('error')
      setSettingsMessage(formatErrorMessage(error))
    }
  }

  const cancelTranslation = async (): Promise<void> => {
    await window.lazyTrans.cancelTranslation()
  }

  const retryTranslation = async (): Promise<void> => {
    const text = (trimmedManual || translation.sourceText).trim()
    if (!text || isLoading) return
    await window.lazyTrans.translateInput(text)
  }

  const clearManualText = (): void => {
    // Keep the synced ref at the latest incoming text so that the input-sync
    // effect treats the empty value as a local edit and does NOT refill the box.
    lastSyncedManualText.current =
      translation.sourceText || translation.manualInputText || ''
    setManualText('')
    setHistoryIndex(null)
    if (translation.status === 'loading') {
      void window.lazyTrans.cancelTranslation()
    }
    textareaRef.current?.focus()
  }

  const openAccessibilitySettings = async (): Promise<void> => {
    await window.lazyTrans.openAccessibilitySettings()
  }

  const reuseHistoryEntry = (entry: HistoryEntry): void => {
    setManualText(entry.sourceText)
    setHistoryIndex(null)
    setIsHistoryOpen(false)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  const copyHistoryEntry = async (entry: HistoryEntry): Promise<void> => {
    await copyText(entry.translatedText, 'translated')
  }

  const removeHistoryEntry = async (entry: HistoryEntry): Promise<void> => {
    const next = await window.lazyTrans.removeHistoryEntry(entry.id)
    setHistory(next)
    if (historyIndex !== null) {
      setHistoryIndex(null)
    }
  }

  const clearAllHistory = async (): Promise<void> => {
    await window.lazyTrans.clearHistory()
    setHistory([])
    setHistoryIndex(null)
    setHistoryQuery('')
    setHistoryClearArmed(false)
  }

  const selectDirection = async (dir: TranslateDirection): Promise<void> => {
    setIsLangPickerOpen(false)
    if (dir === preferences.manualDirection) return
    const updated = await window.lazyTrans.patchPreferences({ manualDirection: dir })
    setPreferences(updated)
    await retryTranslation()
  }

  const selectPromptStyle = async (style: PromptStyle): Promise<void> => {
    if (style === preferences.promptStyle) return
    const updated = await window.lazyTrans.patchPreferences({ promptStyle: style })
    setPreferences(updated)
    await retryTranslation()
  }

  const toggleAutoHide = async (): Promise<void> => {
    const updated = await window.lazyTrans.patchPreferences({
      autoHideOnBlur: !preferences.autoHideOnBlur
    })
    setPreferences(updated)
  }

  const applyCustomShortcut = async (accelerator: string | null): Promise<void> => {
    try {
      const label = await window.lazyTrans.setCustomShortcut(accelerator)
      setLocalShortcutLabel(label)
      const updated = await window.lazyTrans.getPreferences()
      setPreferences(updated)
      setSettingsStatus('saved')
      setSettingsMessage(accelerator ? `快捷键已设为 ${label}` : `已恢复默认快捷键 ${label}`)
    } catch (error) {
      setSettingsStatus('error')
      setSettingsMessage(formatErrorMessage(error))
    }
  }

  const handleShortcutRecord = (
    event: ReactKeyboardEvent<HTMLButtonElement>
  ): void => {
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') {
      setIsRecordingShortcut(false)
      return
    }
    const accelerator = acceleratorFromEvent({
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      code: event.code
    })
    if (!accelerator) return
    setIsRecordingShortcut(false)
    void applyCustomShortcut(accelerator)
  }

  const exportHistory = async (format: 'json' | 'markdown'): Promise<void> => {
    try {
      const path = await window.lazyTrans.exportHistory(format)
      const name = path.split('/').pop() ?? path
      setExportMessage(`已导出 ${name}（下载文件夹）`)
    } catch (error) {
      setExportMessage(formatErrorMessage(error))
    }
    setTimeout(() => setExportMessage(''), 4000)
  }

  const pickTheme = async (theme: ThemePreference): Promise<void> => {
    setIsThemePickerOpen(false)
    if (theme === preferences.theme) return
    const updated = await window.lazyTrans.patchPreferences({ theme })
    setPreferences(updated)
  }

  const togglePlayback = (target: 'source' | 'translated'): void => {
    if (isSpeaking === target) {
      cancelSpeech()
      setIsSpeaking(null)
      return
    }
    if (isSpeaking) {
      cancelSpeech()
    }
    const text = target === 'source' ? sourcePlayableText : translatedPlayableText
    if (!text) return
    const started = speak(text, {
      onStart: () => setIsSpeaking(target),
      onEnd: () => setIsSpeaking((current) => (current === target ? null : current)),
      onError: () => setIsSpeaking((current) => (current === target ? null : current))
    })
    if (!started) {
      setIsSpeaking(null)
    }
  }

  const copyText = async (text: string, target: Exclude<CopyStatus, 'idle' | 'error'>): Promise<void> => {
    if (!text) return
    if (copyResetTimer.current) {
      clearTimeout(copyResetTimer.current)
      copyResetTimer.current = null
    }
    try {
      await window.lazyTrans.writeClipboard(text)
      setCopyStatus(target)
    } catch {
      setCopyStatus('error')
    }
    copyResetTimer.current = setTimeout(() => {
      setCopyStatus('idle')
      copyResetTimer.current = null
    }, 1600)
  }

  const copyTranslatedText = (): Promise<void> => {
    return copyText(translation.translatedText, 'translated')
  }

  const copySourceText = (): Promise<void> => {
    return copyText(translation.sourceText, 'source')
  }

  const statusLabel = getStatusLabel(translation, shortcutLabel)

  return (
    <main className="h-full w-full">
      <Card className="relative flex h-full w-full flex-col overflow-hidden">
        <TitleBar
          status={translation.status}
          statusLabel={statusLabel}
          manualDirection={preferences.manualDirection}
          primaryDirections={PRIMARY_DIRECTIONS}
          targetLanguages={TARGET_LANGUAGES}
          isLangPickerOpen={isLangPickerOpen}
          isHistoryOpen={isHistoryOpen}
          isSettingsOpen={isSettingsOpen}
          onStartDrag={async (e) => {
            if (e.button !== 0) return
            const target = e.target as HTMLElement
            if (target.closest('button,input,textarea,a,[role="button"]')) return
            const { getCurrentWindow } = await import('@tauri-apps/api/window')
            await getCurrentWindow().startDragging()
          }}
          onClose={closeWindow}
          onToggleLangPicker={() => setIsLangPickerOpen((open) => !open)}
          onCloseLangPicker={() => setIsLangPickerOpen(false)}
          onSelectDirection={selectDirection}
          onToggleHistory={() => {
            setIsHistoryOpen((open) => !open)
            if (isSettingsOpen) setIsSettingsOpen(false)
          }}
          onToggleSettings={() => {
            setIsSettingsOpen((current) => !current)
            if (isHistoryOpen) setIsHistoryOpen(false)
          }}
        />

        {isSettingsOpen && (
          <SettingsPanel
            preferences={preferences}
            settingsDraft={settingsDraft}
            settingsStatus={settingsStatus}
            settingsMessage={settingsMessage}
            settingsBusy={settingsBusy}
            shortcutLabel={shortcutLabel}
            promptStyleOptions={PROMPT_STYLE_OPTIONS}
            themeOptions={THEME_OPTIONS}
            apiKeyRef={apiKeyRef}
            isThemePickerOpen={isThemePickerOpen}
            isRecordingShortcut={isRecordingShortcut}
            onToggleThemePicker={() => setIsThemePickerOpen((open) => !open)}
            onPickTheme={pickTheme}
            onSelectPromptStyle={selectPromptStyle}
            onToggleShortcutRecorder={() => setIsRecordingShortcut((value) => !value)}
            onShortcutRecord={handleShortcutRecord}
            onResetShortcut={() => applyCustomShortcut(null)}
            onToggleAutoHide={toggleAutoHide}
            onApplyProviderPreset={applyProviderPreset}
            onUpdateSettingsDraft={updateSettingsDraft}
            onTestApiSettings={testApiSettings}
            onSaveApiSettings={saveApiSettings}
          />
        )}

        {isHistoryOpen && (
          <div
            className="absolute inset-x-0 bottom-0 top-11 z-30 flex flex-col bg-background/95 backdrop-blur-sm"
            role="dialog"
            aria-label="历史记录"
          >
            <HistoryPanel
              entries={history}
              query={historyQuery}
              onQueryChange={setHistoryQuery}
              onReuse={reuseHistoryEntry}
              onCopy={copyHistoryEntry}
              onRemove={removeHistoryEntry}
              onClear={clearAllHistory}
              clearArmed={historyClearArmed}
              onArmClear={() => setHistoryClearArmed(true)}
              onCancelClear={() => setHistoryClearArmed(false)}
              onExport={exportHistory}
              exportMessage={exportMessage}
              onClose={() => {
                setIsHistoryOpen(false)
                setHistoryClearArmed(false)
              }}
            />
          </div>
        )}

        <div className="no-drag relative z-10 flex min-h-0 flex-1 flex-col gap-3 p-3">
          <TranslationInput
            textareaRef={textareaRef}
            manualText={manualText}
            canSubmit={canSubmit}
            isLoading={isLoading}
            canPlaySource={canPlaySource}
            canCopySource={canCopySource}
            copyStatus={copyStatus}
            isSpeaking={isSpeaking}
            onChange={(value) => {
              setManualText(value)
              if (historyIndex !== null) setHistoryIndex(null)
            }}
            onKeyDown={handleKeyDown}
            onTogglePlayback={togglePlayback}
            onCopySource={copySourceText}
            onClear={clearManualText}
            onSubmit={submitManualText}
          />

          <TranslationResult
            translation={translation}
            isLoading={isLoading}
            shortcutLabel={shortcutLabel}
            canRetry={canRetry}
            canPlayTranslated={canPlayTranslated}
            isSpeaking={isSpeaking}
            copyStatus={copyStatus}
            errorActions={errorActions}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onRetry={retryTranslation}
            onOpenAccessibilitySettings={openAccessibilitySettings}
            onCancelTranslation={cancelTranslation}
            onTogglePlayback={togglePlayback}
            onCopyTranslated={copyTranslatedText}
          />
        </div>
      </Card>
    </main>
  )
}

function getStatusLabel(translation: TranslationState, shortcutLabel: string): string {
  if (translation.status === 'loading') {
    if (translation.phase === 'reading-selection') return '读取选区'
    if (translation.translatedText) return '流式翻译中'
    return translation.errorMessage || '翻译中'
  }

  if (translation.status === 'success') return '完成'
  if (translation.status === 'error') {
    if (shouldAutoOpenSettings(translation.errorCode)) return '需要设置'
    return '出错'
  }
  if (translation.status === 'empty') return '待输入'
  if (translation.status === 'cancelled') return '已取消'

  return shortcutLabel
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
