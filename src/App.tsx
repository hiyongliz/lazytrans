import type { KeyboardEvent as ReactKeyboardEvent, ReactElement, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRightLeft,
  Check,
  ChevronDown,
  Clipboard,
  Clock,
  Copy,
  Download,
  Eraser,
  ExternalLink,
  Keyboard,
  Languages,
  Loader2,
  Monitor,
  Moon,
  Pause,
  RefreshCw,
  Search,
  Settings,
  Square,
  Sun,
  Trash2,
  Volume2,
  X
} from 'lucide-react'

import type { ApiSettings } from './lib/types'
import type { HistoryEntry } from './lib/types'
import type { Preferences, PromptStyle, ThemePreference, TranslateDirection } from './lib/types'
import { PROVIDER_PRESETS, findProviderByBaseUrl } from './lib/providers'
import type { TranslationState } from './lib/types'
import {
  PRIMARY_DIRECTIONS,
  PROMPT_STYLE_OPTIONS,
  TARGET_LANGUAGES,
  acceleratorFromEvent,
  displayDirection,
  displayPromptStyle,
  displayTheme,
  errorActionsFor,
  filterHistory,
  formatHistoryTimestamp,
  nextHistoryIndex,
  shouldAutoOpenOnTransition,
  shouldAutoOpenSettings,
  shouldSyncManualInput
} from './lib/app-behavior'
import { cancelSpeech, speak } from './lib/speech'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

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

const DOT_TONE: Record<TranslationState['status'], string> = {
  idle: 'bg-muted-foreground/40',
  loading: 'bg-amber-500 animate-pulse',
  success: 'bg-primary',
  empty: 'bg-muted-foreground/40',
  error: 'bg-destructive',
  cancelled: 'bg-amber-500/60'
}

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

  const activeProviderId = findProviderByBaseUrl(settingsDraft.baseUrl)?.id

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

  const renditionContent = useMemo<ReactElement>(() => {
    const phoneticBlock = translation.phonetic ? (
      <p className="mb-1.5 font-mono text-sm text-muted-foreground select-text">
        {translation.phonetic}
      </p>
    ) : null

    if (translation.status === 'success' && translation.translatedText) {
      return (
        <div key={translation.translatedText} className="space-y-2">
          {phoneticBlock}
          <p className="text-[17px] leading-7 text-foreground whitespace-pre-wrap">
            {translation.translatedText}
          </p>
        </div>
      )
    }

    if (translation.status === 'error') {
      return (
        <div className="space-y-2.5">
          <p className="text-sm leading-relaxed text-destructive">
            {translation.errorMessage || '出错了'}
          </p>
          {errorActions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {errorActions.includes('open-settings') && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => setIsSettingsOpen(true)}
                >
                  <Settings className="h-3.5 w-3.5" />
                  打开设置
                </Button>
              )}
              {errorActions.includes('retry') && canRetry && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => void retryTranslation()}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  重试
                </Button>
              )}
              {errorActions.includes('open-accessibility') && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => void openAccessibilitySettings()}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  辅助功能
                </Button>
              )}
            </div>
          )}
        </div>
      )
    }

    if (isLoading) {
      if (translation.translatedText) {
        return (
          <div className="space-y-2">
            {phoneticBlock}
            <p className="text-[17px] leading-7 text-muted-foreground whitespace-pre-wrap">
              {translation.translatedText}
            </p>
          </div>
        )
      }
      if (translation.errorMessage) {
        return (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {translation.errorMessage}
          </p>
        )
      }
      return (
        <div className="flex flex-col gap-2.5">
          {phoneticBlock}
          <Skeleton className="h-3.5 w-[92%]" />
          <Skeleton className="h-3.5 w-[76%]" />
          <Skeleton className="h-3.5 w-[54%]" />
        </div>
      )
    }

    if (translation.status === 'cancelled') {
      return (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {translation.errorMessage || '已取消'}
        </p>
      )
    }

    if (translation.status === 'empty') {
      return (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {translation.errorMessage || '没有获取到选中文本'}
        </p>
      )
    }

    return (
      <div className="flex h-full w-full items-center justify-center">
        <kbd className="inline-flex items-center rounded border bg-background px-2 py-1 font-mono text-xs text-muted-foreground shadow-sm">
          {shortcutLabel}
        </kbd>
      </div>
    )
  }, [
    canRetry,
    errorActions,
    isLoading,
    shortcutLabel,
    translation.errorMessage,
    translation.phonetic,
    translation.status,
    translation.translatedText
  ])

  const statusLabel = getStatusLabel(translation, shortcutLabel)

  return (
    <main className="h-full w-full">
      <Card className="relative flex h-full w-full flex-col overflow-hidden">
        <header
          data-tauri-drag-region
          onMouseDown={async (e) => {
            if (e.button !== 0) return
            const target = e.target as HTMLElement
            if (target.closest('button,input,textarea,a,[role="button"]')) return
            const { getCurrentWindow } = await import('@tauri-apps/api/window')
            await getCurrentWindow().startDragging()
          }}
          className="drag-region grid h-11 shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2 border-b px-2"
        >
          <div className="no-drag flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={closeWindow}
              aria-label="关闭"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </Button>
            <div className="relative">
              <Button
                type="button"
                variant={preferences.manualDirection === 'auto' ? 'ghost' : 'secondary'}
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => setIsLangPickerOpen((open) => !open)}
                aria-label="选择翻译目标"
                title={`翻译目标：${displayDirection(preferences.manualDirection)}`}
              >
                <Languages className="h-3.5 w-3.5" />
                <span>{displayDirection(preferences.manualDirection)}</span>
                <ChevronDown className="h-3 w-3 shrink-0" />
              </Button>
              {isLangPickerOpen && (
                <div
                  className="absolute left-0 top-9 z-40 w-44 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
                  onMouseLeave={() => setIsLangPickerOpen(false)}
                >
                  <div className="flex flex-col">
                    {PRIMARY_DIRECTIONS.map((dir) => (
                      <button
                        key={dir}
                        type="button"
                        className={cn(
                          'px-3 py-1.5 text-left text-xs hover:bg-accent',
                          dir === preferences.manualDirection && 'font-medium text-primary'
                        )}
                        onClick={() => void selectDirection(dir)}
                      >
                        {displayDirection(dir)}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 border-t">
                    {TARGET_LANGUAGES.map((dir) => (
                      <button
                        key={dir}
                        type="button"
                        className={cn(
                          'px-3 py-1.5 text-left text-xs hover:bg-accent',
                          dir === preferences.manualDirection && 'font-medium text-primary'
                        )}
                        onClick={() => void selectDirection(dir)}
                      >
                        {displayDirection(dir)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="pointer-events-none flex min-w-0 items-center justify-center gap-2">
            <span
              className={cn('inline-block h-1.5 w-1.5 rounded-full', DOT_TONE[translation.status])}
              aria-hidden
            />
            <span className="truncate text-xs text-muted-foreground">
              {statusLabel}
            </span>
          </div>

          <div className="no-drag flex items-center justify-end gap-0.5">
            <Button
              type="button"
              variant={isHistoryOpen ? 'secondary' : 'ghost'}
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                setIsHistoryOpen((open) => !open)
                if (isSettingsOpen) setIsSettingsOpen(false)
              }}
              aria-label="历史记录"
              title="历史记录"
            >
              <Clock className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant={isSettingsOpen ? 'secondary' : 'ghost'}
              size="icon"
              className="h-7 w-7"
              onClick={() => {
                setIsSettingsOpen((current) => !current)
                if (isHistoryOpen) setIsHistoryOpen(false)
              }}
              aria-label="设置"
              title="设置"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {isSettingsOpen && (
          <div
            className="no-drag absolute left-2 right-2 top-12 z-40 max-h-[calc(100%-3.5rem)] overflow-y-auto rounded-md border bg-card/95 px-3 py-3 shadow-lg backdrop-blur"
            role="dialog"
            aria-label="设置"
          >
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault()
                void saveApiSettings()
              }}
            >
              <SettingsSectionTitle>通用</SettingsSectionTitle>

              <SettingRow label="主题">
                <div className="relative">
                  <Button
                    type="button"
                    variant={isThemePickerOpen ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => setIsThemePickerOpen((open) => !open)}
                    aria-label="选择主题"
                    title={`主题：${displayTheme(preferences.theme)}`}
                  >
                    <ThemeIcon theme={preferences.theme} className="h-3.5 w-3.5" />
                    <span>{displayTheme(preferences.theme)}</span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </Button>
                  {isThemePickerOpen && (
                    <div
                      className="absolute right-0 top-9 z-20 min-w-[112px] rounded-md border bg-popover text-popover-foreground shadow-md"
                      onMouseLeave={() => setIsThemePickerOpen(false)}
                    >
                      {THEME_OPTIONS.map((theme) => (
                        <button
                          key={theme}
                          type="button"
                          className={cn(
                            'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent',
                            theme === preferences.theme && 'font-medium text-primary'
                          )}
                          onClick={() => void pickTheme(theme)}
                        >
                          <ThemeIcon theme={theme} className="h-3.5 w-3.5" />
                          <span>{displayTheme(theme)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </SettingRow>

              <SettingRow label="风格">
                {PROMPT_STYLE_OPTIONS.map((style) => (
                  <Button
                    key={style}
                    type="button"
                    variant={style === preferences.promptStyle ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => void selectPromptStyle(style)}
                  >
                    {displayPromptStyle(style)}
                  </Button>
                ))}
              </SettingRow>

              <SettingRow label="快捷键">
                <Button
                  type="button"
                  variant={isRecordingShortcut ? 'default' : 'secondary'}
                  size="sm"
                  className={cn(
                    'h-7 gap-1 px-2 text-xs',
                    isRecordingShortcut && 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                  )}
                  onClick={() => setIsRecordingShortcut((value) => !value)}
                  onKeyDown={isRecordingShortcut ? handleShortcutRecord : undefined}
                  title="点击后按下想要的组合键"
                >
                  {isRecordingShortcut ? (
                    <>
                      <span className="h-2 w-2 animate-pulse rounded-full bg-primary-foreground" />
                      按下组合键…
                    </>
                  ) : (
                    <>
                      <Keyboard className="h-3.5 w-3.5" />
                      {shortcutLabel}
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={() => void applyCustomShortcut(null)}
                  title="恢复默认快捷键"
                >
                  默认
                </Button>
              </SettingRow>

              <SettingRow label="失焦隐藏">
                <button
                  type="button"
                  role="switch"
                  aria-checked={preferences.autoHideOnBlur}
                  aria-label="失焦自动隐藏"
                  onClick={() => void toggleAutoHide()}
                  className={cn(
                    'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
                    preferences.autoHideOnBlur ? 'bg-primary' : 'bg-muted'
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 transform rounded-full bg-background shadow transition-transform',
                      preferences.autoHideOnBlur ? 'translate-x-4' : 'translate-x-0.5'
                    )}
                  />
                </button>
              </SettingRow>

              <div className="border-t pt-1" />
              <SettingsSectionTitle>API</SettingsSectionTitle>

              <SettingRow label="预设" align="start">
                {PROVIDER_PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    variant={activeProviderId === preset.id ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-6 gap-1 px-2 text-xs"
                    onClick={() => applyProviderPreset(preset.id)}
                    title={preset.hint ?? preset.baseUrl}
                  >
                    {preset.name}
                    {preset.hint && (
                      <span className="rounded bg-muted px-1 py-0 text-[10px] text-muted-foreground">
                        本地
                      </span>
                    )}
                  </Button>
                ))}
              </SettingRow>

              <SettingsField label="Key">
                <Input
                  ref={apiKeyRef}
                  type="password"
                  value={settingsDraft.apiKey}
                  placeholder="sk-..."
                  autoComplete="off"
                  onChange={(event) => updateSettingsDraft('apiKey', event.target.value)}
                />
              </SettingsField>

              <SettingsField label="URL">
                <Input
                  type="url"
                  value={settingsDraft.baseUrl}
                  placeholder="默认 https://api.openai.com/v1"
                  onChange={(event) => updateSettingsDraft('baseUrl', event.target.value)}
                />
              </SettingsField>

              <SettingsField label="Model">
                <Input
                  type="text"
                  value={settingsDraft.model}
                  placeholder="默认 gpt-4.1-mini"
                  onChange={(event) => updateSettingsDraft('model', event.target.value)}
                />
              </SettingsField>

              <div className="flex items-center justify-between pt-1">
                <span
                  className={cn(
                    'text-xs',
                    settingsStatus === 'error'
                      ? 'text-destructive'
                      : settingsStatus === 'saved' ||
                          settingsStatus === 'tested' ||
                          settingsStatus === 'preset-applied'
                        ? 'text-primary'
                        : 'text-muted-foreground'
                  )}
                >
                  {settingsMessage || ' '}
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={settingsBusy}
                    onClick={() => void testApiSettings()}
                  >
                    {settingsStatus === 'testing' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowRightLeft className="h-4 w-4" />
                    )}
                    测试
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={settingsBusy}
                  >
                    {settingsStatus === 'loading' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    保存
                  </Button>
                </div>
              </div>
            </form>
          </div>
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
          <div className="relative shrink-0">
            <Textarea
              ref={textareaRef}
              data-manual-input="true"
              value={manualText}
              placeholder="键入或选中…"
              className="min-h-[88px] resize-none border-border/70 bg-background/80 pr-40 shadow-none"
              onChange={(event) => {
                setManualText(event.target.value)
                if (historyIndex !== null) setHistoryIndex(null)
              }}
              onKeyDown={handleKeyDown}
            />
            <div className="absolute bottom-2 right-2 flex items-center gap-1">
              {canPlaySource && (
                <Button
                  type="button"
                  variant={isSpeaking === 'source' ? 'default' : 'secondary'}
                  size="icon"
                  className={cn('h-8 w-8 shadow-sm', isSpeaking !== 'source' && 'bg-background/90')}
                  onClick={() => togglePlayback('source')}
                  aria-label={isSpeaking === 'source' ? '停止播放原文' : '播放原文'}
                  title={isSpeaking === 'source' ? '停止' : '播放原文'}
                >
                  {isSpeaking === 'source' ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </Button>
              )}
              {canCopySource && (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-8 w-8 bg-background/90 shadow-sm"
                  onClick={() => void copySourceText()}
                  aria-label={copyStatus === 'source' ? '已复制原文' : '复制原文'}
                  title={copyStatus === 'source' ? '已复制原文' : '复制原文'}
                >
                  {copyStatus === 'source' ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <Clipboard className="h-4 w-4" />
                  )}
                </Button>
              )}
              {manualText && (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-8 w-8 bg-background/90 shadow-sm"
                  onClick={clearManualText}
                  aria-label="清空输入"
                  title="清空"
                >
                  <Eraser className="h-4 w-4" />
                </Button>
              )}
              <Button
                type="button"
                variant="default"
                size="icon"
                className="h-8 w-8 shadow-sm"
                onClick={() => void submitManualText()}
                disabled={!canSubmit}
                aria-label="翻译"
                title="翻译"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRightLeft className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <Card className="relative flex-1 min-h-0 overflow-hidden bg-card shadow-none">
            <ScrollArea className="h-full">
              <div className="px-4 py-4 pr-12 pb-12 select-text">{renditionContent}</div>
            </ScrollArea>
            {isLoading && (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute left-2 top-2 h-7 w-7 bg-background/90 shadow-sm"
                onClick={() => void cancelTranslation()}
                aria-label="取消翻译"
                title="取消"
              >
                <Square className="h-3 w-3" />
              </Button>
            )}
            <div className="absolute bottom-2 right-2 flex items-center gap-1">
              {canRetry && (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-8 w-8 bg-background/90 shadow-sm"
                  onClick={() => void retryTranslation()}
                  aria-label="重新翻译"
                  title="重试"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
              {canPlayTranslated && (
                <Button
                  type="button"
                  variant={isSpeaking === 'translated' ? 'default' : 'secondary'}
                  size="icon"
                  className={cn('h-8 w-8 shadow-sm', isSpeaking !== 'translated' && 'bg-background/90')}
                  onClick={() => togglePlayback('translated')}
                  aria-label={isSpeaking === 'translated' ? '停止播放译文' : '播放译文'}
                  title={isSpeaking === 'translated' ? '停止' : '播放译文'}
                >
                  {isSpeaking === 'translated' ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </Button>
              )}
              {translation.status === 'success' && translation.translatedText && (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-8 w-8 bg-background/90 shadow-sm"
                  onClick={() => void copyTranslatedText()}
                  aria-label={copyStatus === 'translated' ? '已复制译文' : '复制译文'}
                  title={
                    copyStatus === 'translated'
                      ? '已复制译文'
                      : copyStatus === 'error'
                        ? '复制失败'
                        : '复制译文'
                  }
                >
                  {copyStatus === 'translated' ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          </Card>
        </div>
      </Card>
    </main>
  )
}

interface SettingsFieldProps {
  label: string
  children: ReactElement
}

function SettingsField({ label, children }: SettingsFieldProps): ReactElement {
  return (
    <label className="grid grid-cols-[68px_1fr] items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

interface SettingRowProps {
  label: string
  align?: 'center' | 'start'
  children: ReactNode
}

function SettingRow({ label, align = 'center', children }: SettingRowProps): ReactElement {
  return (
    <div
      className={cn(
        'grid grid-cols-[68px_1fr] gap-2',
        align === 'start' ? 'items-start' : 'items-center'
      )}
    >
      <span
        className={cn(
          'text-xs text-muted-foreground',
          align === 'start' && 'pt-1.5'
        )}
      >
        {label}
      </span>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">{children}</div>
    </div>
  )
}

function SettingsSectionTitle({ children }: { children: ReactNode }): ReactElement {
  return (
    <p className="pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
      {children}
    </p>
  )
}

interface ThemeIconProps {
  theme: ThemePreference
  className?: string
}

function ThemeIcon({ theme, className }: ThemeIconProps): ReactElement {
  if (theme === 'light') return <Sun className={className} />
  if (theme === 'dark') return <Moon className={className} />
  return <Monitor className={className} />
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

interface HistoryPanelProps {
  entries: readonly HistoryEntry[]
  query: string
  onQueryChange: (next: string) => void
  onReuse: (entry: HistoryEntry) => void
  onCopy: (entry: HistoryEntry) => void | Promise<void>
  onRemove: (entry: HistoryEntry) => void | Promise<void>
  onClear: () => void | Promise<void>
  clearArmed: boolean
  onArmClear: () => void
  onCancelClear: () => void
  onExport: (format: 'json' | 'markdown') => void | Promise<void>
  exportMessage: string
  onClose: () => void
}

function HistoryPanel({
  entries,
  query,
  onQueryChange,
  onReuse,
  onCopy,
  onRemove,
  onClear,
  clearArmed,
  onArmClear,
  onCancelClear,
  onExport,
  exportMessage,
  onClose
}: HistoryPanelProps): ReactElement {
  const filtered = useMemo(() => filterHistory(entries, query), [entries, query])
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current)
    }
  }, [])

  const handleCopy = (entry: HistoryEntry): void => {
    void Promise.resolve(onCopy(entry)).then(() => {
      setCopiedId(entry.id)
      if (copyResetRef.current) clearTimeout(copyResetRef.current)
      copyResetRef.current = setTimeout(() => setCopiedId(null), 1200)
    })
  }

  return (
    <div className="no-drag flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          placeholder={`搜索 ${entries.length} 条历史…`}
          className="h-7 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
          onChange={(event) => onQueryChange(event.target.value)}
        />
        {clearArmed ? (
          <>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => void onClear()}
            >
              <Trash2 className="h-3.5 w-3.5" />
              确认清空
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onCancelClear}
            >
              取消
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            onClick={onArmClear}
            disabled={entries.length === 0}
            title="清空全部历史"
          >
            <Trash2 className="h-3.5 w-3.5" />
            清空
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onClose}
          aria-label="关闭历史面板"
          title="收起"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      {(entries.length > 0 || exportMessage) && (
        <div className="flex items-center gap-2 border-b px-3 py-1.5">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            导出
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            disabled={entries.length === 0}
            onClick={() => void onExport('json')}
          >
            <Download className="h-3 w-3" />
            JSON
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            disabled={entries.length === 0}
            onClick={() => void onExport('markdown')}
          >
            <Download className="h-3 w-3" />
            Markdown
          </Button>
          {exportMessage && (
            <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
              {exportMessage}
            </span>
          )}
        </div>
      )}
      <ScrollArea className="min-h-0 flex-1">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {entries.length === 0 ? '还没有历史记录' : '没有匹配的记录'}
          </p>
        ) : (
          <ul className="divide-y">
            {filtered.map((entry) => (
              <li
                key={entry.id}
                className="group cursor-pointer px-3 py-2 hover:bg-accent/60 focus-within:bg-accent/60"
                role="button"
                tabIndex={0}
                onClick={() => onReuse(entry)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onReuse(entry)
                  }
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{entry.sourceText}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {entry.translatedText}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-muted-foreground/70">
                      <span className="mr-1 rounded bg-muted px-1 py-px text-muted-foreground">
                        {displayDirection(entry.direction)}
                      </span>
                      {formatHistoryTimestamp(entry.createdAt)} · {entry.model}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 text-muted-foreground/60 transition-opacity group-hover:text-foreground">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleCopy(entry)
                      }}
                      aria-label={copiedId === entry.id ? '已复制译文' : '复制译文'}
                      title={copiedId === entry.id ? '已复制' : '复制译文'}
                    >
                      {copiedId === entry.id ? (
                        <Check className="h-3 w-3 text-primary" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={(event) => {
                        event.stopPropagation()
                        void onRemove(entry)
                      }}
                      aria-label="删除该条"
                      title="删除"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  )
}
