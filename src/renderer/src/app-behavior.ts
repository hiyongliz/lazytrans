import type { TranslateDirection } from '../../main/preferences'
import type { HistoryEntry } from '../../main/history'
import type { TranslationErrorCode } from '../../main/translation-errors'
import type { TranslationStatus } from '../../main/window'

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

export function displayDirection(current: TranslateDirection): string {
  if (current === 'zh-en') return '中→英'
  if (current === 'en-zh') return '英→中'
  return '自动'
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
