import type { PromptStyle, ThemePreference, TranslateDirection } from './types'
import type { HistoryEntry } from './types'
import type { TranslationErrorCode } from './types'
import type { TranslationStatus } from './types'

interface ShouldSyncManualInputOptions {
  incomingText: string | undefined
  currentText: string
  lastSyncedText: string
  isInputFocused: boolean
  status: TranslationStatus
}

export function shouldSyncManualInput({
  incomingText,
  currentText,
  lastSyncedText,
  isInputFocused,
  status
}: ShouldSyncManualInputOptions): boolean {
  if (incomingText === undefined || incomingText === currentText) {
    return false
  }

  const hasLocalEdit = currentText !== lastSyncedText
  if (isInputFocused && hasLocalEdit && status !== 'loading') {
    return false
  }

  return true
}

export function shouldAutoOpenSettings(errorCode: TranslationErrorCode | undefined): boolean {
  return errorCode === 'missing-api-key' || errorCode === 'auth-failed'
}

export type ErrorAction = 'open-settings' | 'retry' | 'open-accessibility'

export function errorActionsFor(
  errorCode: TranslationErrorCode | undefined
): ErrorAction[] {
  switch (errorCode) {
    case 'missing-api-key':
    case 'auth-failed':
      return ['open-settings']
    case 'rate-limited':
    case 'network':
      return ['retry', 'open-settings']
    case 'api-timeout':
      return ['retry']
    case 'selection-permission':
      return ['open-accessibility', 'retry']
    case 'api-error':
      return ['retry']
    default:
      return []
  }
}

export type HistoryNavDirection = 'up' | 'down'

export function nextHistoryIndex(
  currentIndex: number | null,
  direction: HistoryNavDirection,
  total: number
): number | null {
  if (total <= 0) {
    return null
  }

  if (direction === 'up') {
    if (currentIndex === null) {
      return 0
    }
    if (currentIndex + 1 >= total) {
      return currentIndex
    }
    return currentIndex + 1
  }

  if (currentIndex === null || currentIndex <= 0) {
    return null
  }
  return currentIndex - 1
}

export function cycleDirection(current: TranslateDirection): TranslateDirection {
  if (current === 'auto') return 'zh-en'
  if (current === 'zh-en') return 'en-zh'
  return 'auto'
}

const DIRECTION_LABELS: Record<TranslateDirection, string> = {
  auto: '自动',
  'zh-en': '中→英',
  'en-zh': '英→中',
  zh: '中文',
  en: '英文',
  ja: '日语',
  ko: '韩语',
  fr: '法语',
  de: '德语',
  es: '西班牙语',
  ru: '俄语'
}

export function displayDirection(current: TranslateDirection): string {
  return DIRECTION_LABELS[current] ?? '自动'
}

export const DIRECTION_OPTIONS = Object.keys(DIRECTION_LABELS) as TranslateDirection[]

export const PRIMARY_DIRECTIONS: TranslateDirection[] = ['auto', 'zh-en', 'en-zh']

export const TARGET_LANGUAGES: TranslateDirection[] = [
  'zh',
  'en',
  'ja',
  'ko',
  'fr',
  'de',
  'es',
  'ru'
]

export const PROMPT_STYLE_OPTIONS: PromptStyle[] = ['programmer', 'normal', 'formal']

export function displayPromptStyle(style: PromptStyle): string {
  if (style === 'normal') return '普通'
  if (style === 'formal') return '正式'
  return '程序员'
}

export interface ShortcutKeyEvent {
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  code: string
}

export function acceleratorFromEvent(event: ShortcutKeyEvent): string | null {
  if (/^(Meta|Control|Alt|Shift|OS)/.test(event.code)) return null
  const mods: string[] = []
  if (event.metaKey) mods.push('Super')
  if (event.ctrlKey) mods.push('Ctrl')
  if (event.altKey) mods.push('Alt')
  if (event.shiftKey) mods.push('Shift')
  if (mods.length === 0) return null
  return [...mods, event.code].join('+')
}

export function displayTheme(current: ThemePreference): string {
  if (current === 'dark') return '深色'
  if (current === 'light') return '浅色'
  return '系统'
}

export function shouldAutoOpenOnTransition(
  previousCode: TranslationErrorCode | undefined,
  nextCode: TranslationErrorCode | undefined
): boolean {
  return shouldAutoOpenSettings(nextCode) && previousCode !== nextCode
}

export function filterHistory(
  entries: readonly HistoryEntry[],
  query: string
): HistoryEntry[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) {
    return [...entries]
  }
  return entries.filter((entry) => {
    return (
      entry.sourceText.toLowerCase().includes(trimmed) ||
      entry.translatedText.toLowerCase().includes(trimmed) ||
      entry.model.toLowerCase().includes(trimmed)
    )
  })
}

export function formatHistoryTimestamp(timestamp: number, now: number = Date.now()): string {
  const delta = Math.max(0, now - timestamp)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (delta < minute) return '刚刚'
  if (delta < hour) return `${Math.floor(delta / minute)} 分钟前`
  if (delta < day) return `${Math.floor(delta / hour)} 小时前`
  if (delta < 7 * day) return `${Math.floor(delta / day)} 天前`

  const date = new Date(timestamp)
  const year = date.getFullYear()
  const nowYear = new Date(now).getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day2 = `${date.getDate()}`.padStart(2, '0')
  return year === nowYear ? `${month}-${day2}` : `${year}-${month}-${day2}`
}
