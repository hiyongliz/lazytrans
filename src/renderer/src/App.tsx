import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRightLeft,
  Check,
  ChevronDown,
  Clipboard,
  Clock,
  Copy,
  Eraser,
  ExternalLink,
  Languages,
  Loader2,
  MoonStar,
  Pause,
  RefreshCw,
  Search,
  Settings,
  Square,
  Trash2,
  Volume2,
  X
} from 'lucide-react'

import type { ApiSettings } from '../../main/settings'
import type { HistoryEntry } from '../../main/history'
import type {
  Preferences,
  ThemePreference,
  TranslateDirection
} from '../../main/preferences'
import { PROVIDER_PRESETS, findProviderByBaseUrl } from '../../main/providers'
import type { TranslationState } from '../../main/window'
import {
  cycleDirection,
  displayDirection,
  errorActionsFor,
  filterHistory,
  formatHistoryTimestamp,
  nextHistoryIndex,
  shouldAutoOpenOnTransition,
  shouldAutoOpenSettings,
  shouldSyncManualInput
} from './app-behavior'
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
  recentModels: [],
  shortcutDowngradeAcknowledged: false
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
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false)
  const [currentModel, setCurrentModel] = useState('')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [historyQuery, setHistoryQuery] = useState('')
  const [historyClearArmed, setHistoryClearArmed] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const apiKeyRef = useRef<HTMLInputElement>(null)
  const lastSyncedManualText = useRef('')
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const previousErrorCode = useRef<TranslationState['errorCode']>(undefined)

  const shortcutLabel = translation.shortcutLabel ?? 'Option + D'
  const trimmedManual = manualText.trim()
  const canSubmit =
    trimmedManual.length > 0 && translation.status !== 'loading' && !isSubmitting
  const isLoading = translation.status === 'loading'
  const settingsBusy = settingsStatus === 'loading' || settingsStatus === 'testing'
  const canRetry = !isLoading && Boolean(trimmedManual || translation.sourceText.trim())
  const canCopySource = Boolean(translation.sourceText.trim())
  const playableText = (trimmedManual || translation.sourceText.trim())
  const canPlayAudio = playableText.length > 0
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
    void window.lazyTrans.getApiSettings().then((settings) => {
      setCurrentModel(settings.model)
    })
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
    const handleWindowKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return
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
  }, [historyClearArmed, isHistoryOpen, isSettingsOpen])

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

    if (manualText.includes('\n')) return
    if (history.length === 0) return

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
      setCurrentModel(saved.model)
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
    setManualText('')
    lastSyncedManualText.current = ''
    setHistoryIndex(null)
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

  const toggleDirection = async (): Promise<void> => {
    const next = cycleDirection(preferences.manualDirection)
    const updated = await window.lazyTrans.patchPreferences({ manualDirection: next })
    setPreferences(updated)
  }

  const toggleTheme = async (): Promise<void> => {
    const order: ThemePreference[] = ['system', 'light', 'dark']
    const nextIndex = (order.indexOf(preferences.theme) + 1) % order.length
    const updated = await window.lazyTrans.patchPreferences({ theme: order[nextIndex] })
    setPreferences(updated)
  }

  const pickRecentModel = async (model: string): Promise<void> => {
    setIsModelPickerOpen(false)
    if (!model || model === currentModel) return
    const current = await window.lazyTrans.getApiSettings()
    if (!current.apiKey) {
      setIsSettingsOpen(true)
      return
    }
    const saved = await window.lazyTrans.saveApiSettings({
      ...current,
      model
    })
    setSettingsDraft(saved)
    setCurrentModel(saved.model)
    const prefs = await window.lazyTrans.getPreferences()
    setPreferences(prefs)
  }

  const togglePlayback = (): void => {
    if (isSpeaking) {
      cancelSpeech()
      setIsSpeaking(false)
      return
    }
    if (!playableText) return
    const started = speak(playableText, {
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false)
    })
    if (!started) {
      setIsSpeaking(false)
    }
  }

  const copyText = async (text: string, target: Exclude<CopyStatus, 'idle' | 'error'>): Promise<void> => {
    if (!text) return
    if (copyResetTimer.current) {
      clearTimeout(copyResetTimer.current)
      copyResetTimer.current = null
    }
    try {
      await navigator.clipboard.writeText(text)
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
        <div key={translation.translatedText}>
          {phoneticBlock}
          <p className="text-base leading-relaxed text-foreground whitespace-pre-wrap">
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
          <div>
            {phoneticBlock}
            <p className="text-base leading-relaxed text-muted-foreground whitespace-pre-wrap">
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
    <main className="h-full w-full p-2">
      <Card className="relative flex h-full w-full flex-col overflow-hidden">
        <header className="drag-region flex h-11 shrink-0 items-center justify-between border-b px-2">
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
            <Button
              type="button"
              variant={preferences.manualDirection === 'auto' ? 'ghost' : 'secondary'}
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => void toggleDirection()}
              aria-label="切换翻译方向"
              title={`翻译方向：${displayDirection(preferences.manualDirection)}`}
            >
              <Languages className="h-3.5 w-3.5" />
              <span>{displayDirection(preferences.manualDirection)}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => void toggleTheme()}
              aria-label="切换主题"
              title={`主题：${preferences.theme === 'system' ? '跟随系统' : preferences.theme === 'dark' ? '深色' : '浅色'}`}
            >
              <MoonStar className="h-3.5 w-3.5" />
            </Button>
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
          </div>

          <div className="pointer-events-none flex items-center gap-2">
            <span
              className={cn('inline-block h-1.5 w-1.5 rounded-full', DOT_TONE[translation.status])}
              aria-hidden
            />
            <span className="max-w-[110px] truncate text-xs text-muted-foreground">
              {statusLabel}
            </span>
          </div>

          <div className="no-drag relative flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 max-w-[130px] gap-1 px-2 text-xs"
              onClick={() => setIsModelPickerOpen((open) => !open)}
              aria-label="切换模型"
              title={currentModel || '未配置模型'}
            >
              <span className="truncate">{currentModel || '未配置'}</span>
              <ChevronDown className="h-3 w-3 shrink-0" />
            </Button>
            {isModelPickerOpen && (
              <div
                className="absolute right-0 top-9 z-20 min-w-[180px] rounded-md border bg-popover text-popover-foreground shadow-md"
                onMouseLeave={() => setIsModelPickerOpen(false)}
              >
                {preferences.recentModels.length === 0 ? (
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
                    onClick={() => {
                      setIsModelPickerOpen(false)
                      setIsSettingsOpen(true)
                    }}
                  >
                    暂无最近模型，去设置
                  </button>
                ) : (
                  preferences.recentModels.map((model) => (
                    <button
                      key={model}
                      type="button"
                      className={cn(
                        'block w-full truncate px-3 py-1.5 text-left text-xs hover:bg-accent',
                        model === currentModel && 'font-medium text-primary'
                      )}
                      onClick={() => void pickRecentModel(model)}
                    >
                      {model}
                    </button>
                  ))
                )}
                <button
                  type="button"
                  className="block w-full border-t px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
                  onClick={() => {
                    setIsModelPickerOpen(false)
                    setIsSettingsOpen(true)
                  }}
                >
                  管理…
                </button>
              </div>
            )}
            <Button
              type="button"
              variant={isSettingsOpen ? 'secondary' : 'ghost'}
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsSettingsOpen((current) => !current)}
              aria-label="设置"
              title="设置"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {isSettingsOpen && (
          <div className="no-drag border-b px-3 py-3">
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault()
                void saveApiSettings()
              }}
            >
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-xs uppercase tracking-wide text-muted-foreground">
                  预设
                </span>
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
              </div>

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
              className="min-h-[72px] resize-none pr-24"
              onChange={(event) => {
                setManualText(event.target.value)
                if (historyIndex !== null) setHistoryIndex(null)
              }}
              onKeyDown={handleKeyDown}
            />
            {manualText && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute bottom-2 right-11 h-8 w-8"
                onClick={clearManualText}
                aria-label="清空输入"
                title="清空"
              >
                <Eraser className="h-4 w-4" />
              </Button>
            )}
            <Button
              type="button"
              size="icon"
              className="absolute bottom-2 right-2 h-8 w-8"
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

          <Card className="relative flex-1 min-h-0 overflow-hidden bg-muted/40 shadow-none">
            <ScrollArea className="h-full">
              <div className="px-4 py-3.5 pr-12 pb-12 select-text">{renditionContent}</div>
            </ScrollArea>
            {isLoading && (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute left-2 top-2 h-7 w-7 shadow-sm"
                onClick={() => void cancelTranslation()}
                aria-label="取消翻译"
                title="取消"
              >
                <Square className="h-3 w-3" />
              </Button>
            )}
            <div className="absolute bottom-2 right-2 flex items-center gap-1">
              {canPlayAudio && (
                <Button
                  type="button"
                  variant={isSpeaking ? 'default' : 'secondary'}
                  size="icon"
                  className="h-8 w-8 shadow-sm"
                  onClick={togglePlayback}
                  aria-label={isSpeaking ? '停止播放' : '播放原文'}
                  title={isSpeaking ? '停止' : '播放'}
                >
                  {isSpeaking ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </Button>
              )}
              {canRetry && (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-8 w-8 shadow-sm"
                  onClick={() => void retryTranslation()}
                  aria-label="重新翻译"
                  title="重试"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
              {canCopySource && (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-8 w-8 shadow-sm"
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
              {translation.status === 'success' && translation.translatedText && (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-8 w-8 shadow-sm"
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
    <label className="grid grid-cols-[60px_1fr] items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
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
