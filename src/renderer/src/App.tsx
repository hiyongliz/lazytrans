import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRightLeft,
  Check,
  Clipboard,
  Copy,
  Eraser,
  ExternalLink,
  Loader2,
  RefreshCw,
  Settings,
  Square,
  X
} from 'lucide-react'

import type { ApiSettings } from '../../main/settings'
import type { TranslationState } from '../../main/window'
import lazyTransLogo from './assets/lazytrans-logo.png'
import { shouldAutoOpenSettings, shouldSyncManualInput } from './app-behavior'
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

type SettingsStatus = 'idle' | 'loading' | 'testing' | 'saved' | 'tested' | 'error'
type CopyStatus = 'idle' | 'translated' | 'source' | 'error'

const DOT_TONE: Record<TranslationState['status'], string> = {
  idle: 'bg-muted-foreground/40',
  loading: 'bg-amber-500 animate-pulse',
  success: 'bg-primary',
  empty: 'bg-muted-foreground/40',
  error: 'bg-destructive',
  cancelled: 'bg-muted-foreground/40'
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const apiKeyRef = useRef<HTMLInputElement>(null)
  const lastSyncedManualText = useRef('')
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const shortcutLabel = translation.shortcutLabel ?? 'Option + D'
  const trimmedManual = manualText.trim()
  const canSubmit =
    trimmedManual.length > 0 && translation.status !== 'loading' && !isSubmitting
  const isLoading = translation.status === 'loading'
  const settingsBusy = settingsStatus === 'loading' || settingsStatus === 'testing'
  const canRetry = !isLoading && Boolean(trimmedManual || translation.sourceText.trim())
  const canCopySource = Boolean(translation.sourceText.trim())
  const canOpenSettingsFromError = shouldAutoOpenSettings(translation.errorCode)
  const canOpenAccessibilityFromError = translation.errorCode === 'selection-permission'

  useEffect(() => {
    return window.lazyTrans.onTranslationUpdate(setTranslation)
  }, [])

  useEffect(() => {
    void window.lazyTrans.updateManualInput(manualText)
  }, [manualText])

  useEffect(() => {
    if (!canOpenSettingsFromError) return

    setIsSettingsOpen(true)
    setSettingsStatus('error')
    setSettingsMessage('请先补全 API 设置')
    requestAnimationFrame(() => {
      apiKeyRef.current?.focus()
    })
  }, [canOpenSettingsFromError])

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
    }
  }, [])

  useEffect(() => {
    const handleWindowKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeWindow()
    }

    window.addEventListener('keydown', handleWindowKeyDown)
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown)
    }
  }, [])

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
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    void submitManualText()
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

  const saveApiSettings = async (): Promise<void> => {
    setSettingsStatus('loading')
    setSettingsMessage('')
    try {
      const saved = await window.lazyTrans.saveApiSettings(settingsDraft)
      setSettingsDraft(saved)
      setSettingsStatus('saved')
      setSettingsMessage('已保存')
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
    textareaRef.current?.focus()
  }

  const openAccessibilitySettings = async (): Promise<void> => {
    await window.lazyTrans.openAccessibilitySettings()
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
    if (translation.status === 'success' && translation.translatedText) {
      return (
        <p
          key={translation.translatedText}
          className="text-base leading-relaxed text-foreground whitespace-pre-wrap"
        >
          {translation.translatedText}
        </p>
      )
    }

    if (translation.status === 'error') {
      return (
        <p className="text-sm leading-relaxed text-destructive">
          {translation.errorMessage || '出错了'}
        </p>
      )
    }

    if (isLoading) {
      if (translation.translatedText) {
        return (
          <p className="text-base leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {translation.translatedText}
          </p>
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
    isLoading,
    shortcutLabel,
    translation.errorMessage,
    translation.status,
    translation.translatedText
  ])

  const statusLabel = getStatusLabel(translation, shortcutLabel)

  return (
    <main className="h-full w-full p-2">
      <Card className="flex h-full w-full flex-col overflow-hidden">
        <header className="drag-region flex h-11 shrink-0 items-center justify-between border-b px-2">
          <div className="no-drag flex items-center">
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
          </div>

          <div className="pointer-events-none flex items-center gap-2">
            <img src={lazyTransLogo} alt="lazytrans" className="h-6 w-6" />
            <span
              className={cn('inline-block h-1.5 w-1.5 rounded-full', DOT_TONE[translation.status])}
              aria-hidden
            />
            <span className="max-w-[210px] truncate text-xs text-muted-foreground">
              {statusLabel}
            </span>
          </div>

          <div className="no-drag flex items-center">
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
                      : settingsStatus === 'saved' || settingsStatus === 'tested'
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

        <div className="no-drag relative z-10 flex min-h-0 flex-1 flex-col gap-3 p-3">
          <div className="relative shrink-0">
            <Textarea
              ref={textareaRef}
              data-manual-input="true"
              value={manualText}
              placeholder="键入或选中…"
              className="min-h-[72px] resize-none pr-24"
              onChange={(event) => setManualText(event.target.value)}
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
            <div className="absolute bottom-2 right-2 flex items-center gap-1">
              {isLoading && (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-8 w-8 shadow-sm"
                  onClick={() => void cancelTranslation()}
                  aria-label="取消翻译"
                  title="取消"
                >
                  <Square className="h-3.5 w-3.5" />
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
              {canOpenSettingsFromError && (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-8 w-8 shadow-sm"
                  onClick={() => setIsSettingsOpen(true)}
                  aria-label="打开设置"
                  title="设置"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              )}
              {canOpenAccessibilityFromError && (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="h-8 w-8 shadow-sm"
                  onClick={() => void openAccessibilitySettings()}
                  aria-label="打开辅助功能设置"
                  title="打开辅助功能设置"
                >
                  <ExternalLink className="h-4 w-4" />
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
