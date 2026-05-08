import type { KeyboardEvent, ReactElement } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRightLeft, Check, Copy, Loader2, Settings, X } from 'lucide-react'

import type { ApiSettings } from '../../main/settings'
import type { TranslationState } from '../../main/window'
import lazyTransLogo from './assets/lazytrans-logo.png'
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

type SettingsStatus = 'idle' | 'loading' | 'saved' | 'error'
type CopyStatus = 'idle' | 'copied' | 'error'

const DOT_TONE: Record<TranslationState['status'], string> = {
  idle: 'bg-muted-foreground/40',
  loading: 'bg-amber-500 animate-pulse',
  success: 'bg-primary',
  empty: 'bg-muted-foreground/40',
  error: 'bg-destructive'
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
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const shortcutLabel = translation.shortcutLabel ?? 'Option + D'
  const trimmedManual = manualText.trim()
  const canSubmit =
    trimmedManual.length > 0 && translation.status !== 'loading' && !isSubmitting
  const isLoading = translation.status === 'loading'

  useEffect(() => {
    return window.lazyTrans.onTranslationUpdate(setTranslation)
  }, [])

  useEffect(() => {
    void window.lazyTrans.updateManualInput(manualText)
  }, [manualText])

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
    if (next !== undefined) {
      setManualText(next)
    }
    if (translation.status === 'empty') {
      textareaRef.current?.focus()
    }
  }, [translation.manualInputText, translation.sourceText, translation.status])

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

  const submitManualText = async (): Promise<void> => {
    if (!canSubmit) return
    setIsSubmitting(true)
    try {
      await window.lazyTrans.translateInput(manualText)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
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

  const copyTranslatedText = async (): Promise<void> => {
    const text = translation.translatedText
    if (!text) return
    if (copyResetTimer.current) {
      clearTimeout(copyResetTimer.current)
      copyResetTimer.current = null
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('error')
    }
    copyResetTimer.current = setTimeout(() => {
      setCopyStatus('idle')
      copyResetTimer.current = null
    }, 1600)
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
      return (
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-3.5 w-[92%]" />
          <Skeleton className="h-3.5 w-[76%]" />
          <Skeleton className="h-3.5 w-[54%]" />
        </div>
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
                  placeholder="https://api.openai.com/v1"
                  onChange={(event) => updateSettingsDraft('baseUrl', event.target.value)}
                />
              </SettingsField>

              <SettingsField label="Model">
                <Input
                  type="text"
                  value={settingsDraft.model}
                  placeholder="gpt-4.1-mini"
                  onChange={(event) => updateSettingsDraft('model', event.target.value)}
                />
              </SettingsField>

              <div className="flex items-center justify-between pt-1">
                <span
                  className={cn(
                    'text-xs',
                    settingsStatus === 'error'
                      ? 'text-destructive'
                      : settingsStatus === 'saved'
                        ? 'text-primary'
                        : 'text-muted-foreground'
                  )}
                >
                  {settingsMessage || ' '}
                </span>
                <Button
                  type="submit"
                  size="sm"
                  disabled={settingsStatus === 'loading'}
                >
                  {settingsStatus === 'loading' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  保存
                </Button>
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
              className="min-h-[72px] resize-none pr-12"
              onChange={(event) => setManualText(event.target.value)}
              onKeyDown={handleKeyDown}
            />
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
            {translation.status === 'success' && translation.translatedText && (
              <Button
                type="button"
                variant="secondary"
                size="icon"
                className="absolute bottom-2 right-2 h-8 w-8 shadow-sm"
                onClick={() => void copyTranslatedText()}
                aria-label={copyStatus === 'copied' ? '已复制' : '复制翻译'}
                title={
                  copyStatus === 'copied'
                    ? '已复制'
                    : copyStatus === 'error'
                      ? '复制失败'
                      : '复制'
                }
              >
                {copyStatus === 'copied' ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            )}
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

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
