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
