import type { KeyboardEvent, ReactElement } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { ApiSettings } from '../../main/settings'
import type { TranslationState } from '../../main/window'
import lazyTransLogo from './assets/lazytrans-logo.png'

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

const DOT_TONE: Record<TranslationState['status'], string> = {
  idle: 'idle',
  loading: 'loading',
  success: 'success',
  empty: 'idle',
  error: 'error'
}

export default function App(): ReactElement {
  const [translation, setTranslation] = useState<TranslationState>(initialState)
  const [manualText, setManualText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState<ApiSettings>(emptyApiSettings)
  const [settingsStatus, setSettingsStatus] = useState<SettingsStatus>('idle')
  const [settingsMessage, setSettingsMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  const renditionContent = useMemo<ReactElement>(() => {
    if (translation.status === 'success' && translation.translatedText) {
      return (
        <p
          key={translation.translatedText}
          className="font-display text-[19px] leading-[1.65] text-navy tracking-tight animate-bubble"
        >
          {translation.translatedText}
        </p>
      )
    }

    if (translation.status === 'error') {
      return (
        <p className="font-sans text-[13px] leading-relaxed text-[#C73E3E]">
          {translation.errorMessage || '出错了'}
        </p>
      )
    }

    if (isLoading) {
      if (translation.translatedText) {
        return (
          <p className="font-display text-[19px] leading-[1.65] text-navy/70 tracking-tight">
            {translation.translatedText}
          </p>
        )
      }
      return (
        <div className="flex flex-col gap-2.5">
          <div className="shimmer-line" style={{ width: '92%' }} />
          <div className="shimmer-line" style={{ width: '76%' }} />
          <div className="shimmer-line" style={{ width: '54%' }} />
        </div>
      )
    }

    if (translation.status === 'empty') {
      return (
        <p className="font-sans text-[13px] leading-relaxed text-navy-mute">
          {translation.errorMessage || '没有获取到选中文本'}
        </p>
      )
    }

    // idle — minimal hint, kbd only
    return (
      <div className="flex h-full w-full items-center justify-center">
        <kbd className="kbd-pill !text-[12px] !px-3 !py-1.5">{shortcutLabel}</kbd>
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
    <main className="h-full w-full p-0">
      <section className="glass-shell relative flex h-full w-full flex-col overflow-hidden rounded-[18px] font-sans text-navy animate-rise">
        {/* Titlebar — logo only, no brand text */}
        <header className="drag-region relative z-10 flex h-[44px] shrink-0 items-center justify-between px-3.5">
          <div className="no-drag flex items-center">
            <button
              type="button"
              onClick={closeWindow}
              className="glyph"
              aria-label="关闭"
              title="关闭"
            >
              <CloseGlyph />
            </button>
          </div>

          <div className="pointer-events-none flex items-center gap-2">
            <img
              src={lazyTransLogo}
              alt="lazytrans"
              className="h-7 w-7 drop-shadow-[0_2px_8px_rgba(31,143,255,0.5)]"
            />
            <span
              className="status-dot"
              data-tone={DOT_TONE[translation.status]}
              aria-hidden
            />
          </div>

          <div className="no-drag flex items-center">
            <button
              type="button"
              onClick={() => setIsSettingsOpen((current) => !current)}
              className="glyph"
              data-active={isSettingsOpen ? 'true' : 'false'}
              aria-label="设置"
              title="设置"
            >
              <GearGlyph />
            </button>
          </div>
        </header>

        {/* Settings drawer — minimal labels only */}
        {isSettingsOpen && (
          <div className="no-drag z-10 px-4 pt-1 pb-4 animate-bubble">
            <form
              className="glass-tile flex flex-col gap-2 p-3"
              onSubmit={(event) => {
                event.preventDefault()
                void saveApiSettings()
              }}
            >
              <SettingsField label="key">
                <input
                  className="glass-input"
                  type="password"
                  value={settingsDraft.apiKey}
                  placeholder="sk-..."
                  autoComplete="off"
                  onChange={(event) => updateSettingsDraft('apiKey', event.target.value)}
                />
              </SettingsField>

              <SettingsField label="url">
                <input
                  className="glass-input"
                  type="url"
                  value={settingsDraft.baseUrl}
                  placeholder="https://api.openai.com/v1"
                  onChange={(event) => updateSettingsDraft('baseUrl', event.target.value)}
                />
              </SettingsField>

              <SettingsField label="model">
                <input
                  className="glass-input"
                  type="text"
                  value={settingsDraft.model}
                  placeholder="gpt-4.1-mini"
                  onChange={(event) => updateSettingsDraft('model', event.target.value)}
                />
              </SettingsField>

              <div className="mt-1 flex items-center justify-between">
                <span
                  className={`font-sans text-[11px] ${
                    settingsStatus === 'error'
                      ? 'text-[#C73E3E]'
                      : settingsStatus === 'saved'
                        ? 'text-sky-600'
                        : 'text-navy-mist'
                  }`}
                >
                  {settingsMessage || ' '}
                </span>
                <button
                  type="submit"
                  className="btn-icon"
                  disabled={settingsStatus === 'loading'}
                  aria-label="保存"
                  title="保存"
                >
                  <CheckGlyph />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Body — two glass cards, no labels */}
        <div className="no-drag relative z-10 flex min-h-0 flex-1 flex-col gap-3 px-4 pt-1 pb-4">
          {/* Source — textarea with floating submit button at bottom-right */}
          <div className="glass-tile relative shrink-0">
            <textarea
              ref={textareaRef}
              data-manual-input="true"
              value={manualText}
              placeholder="键入或选中…"
              className="glass-textarea pr-14"
              onChange={(event) => setManualText(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              type="button"
              onClick={() => void submitManualText()}
              disabled={!canSubmit}
              className="btn-icon absolute bottom-2.5 right-2.5"
              aria-label="翻译"
              title="翻译"
            >
              <SwapGlyph />
            </button>
          </div>

          {/* Rendition — translation result, no label */}
          <div className="glass-tile glass-tile--blue relative flex-1 min-h-0 overflow-hidden">
            <div className="absolute inset-0 overflow-y-auto px-4 py-3.5 select-text">
              {renditionContent}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

interface SettingsFieldProps {
  label: string
  children: ReactElement
}

function SettingsField({ label, children }: SettingsFieldProps): ReactElement {
  return (
    <label className="flex items-center gap-3 rounded-[10px] bg-white/55 px-3 ring-1 ring-inset ring-[rgba(222,231,245,0.9)] focus-within:ring-[rgba(31,143,255,0.45)] focus-within:bg-white/85 transition">
      <span className="w-[42px] shrink-0 font-mono text-[10px] uppercase tracking-wide text-navy-mute">
        {label}
      </span>
      {children}
    </label>
  )
}

function CloseGlyph(): ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    >
      <path d="M3 3 L9 9" />
      <path d="M9 3 L3 9" />
    </svg>
  )
}

function GearGlyph(): ReactElement {
  // Heroicons cog-6-tooth — proper proportioned gear with rounded teeth and a center hub
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a6.759 6.759 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.213-1.281Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

// double-arrow icon — semantically expresses translation as bidirectional swap
function SwapGlyph(): ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.6 4.6 H10.4" />
      <path d="M8 2.4 L10.4 4.6 L8 6.8" />
      <path d="M11.4 9.4 H3.6" />
      <path d="M6 7.2 L3.6 9.4 L6 11.6" />
    </svg>
  )
}

function CheckGlyph(): ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.8 7.4 L5.6 10.2 L11.2 4" />
    </svg>
  )
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
