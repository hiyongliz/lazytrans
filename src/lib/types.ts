export type TranslationStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error' | 'cancelled'
export type TranslationPhase = 'reading-selection' | 'translating'
export type TranslateDirection =
  | 'auto'
  | 'zh-en'
  | 'en-zh'
  | 'zh'
  | 'en'
  | 'ja'
  | 'ko'
  | 'fr'
  | 'de'
  | 'es'
  | 'ru'

export type PromptStyle = 'programmer' | 'normal' | 'formal'

export type TranslationErrorCode =
  | 'missing-api-key'
  | 'auth-failed'
  | 'rate-limited'
  | 'api-timeout'
  | 'selection-permission'
  | 'network'
  | 'api-error'

export interface TranslationState {
  status: TranslationStatus
  phase?: TranslationPhase
  sourceText: string
  translatedText: string
  errorMessage: string
  errorCode?: TranslationErrorCode
  shortcutLabel?: string
  manualInputText?: string
  phonetic?: string
}

export interface ApiSettings { apiKey: string; baseUrl: string; model: string }

export interface HistoryEntry {
  id: string
  sourceText: string
  translatedText: string
  model: string
  baseUrl: string
  direction: TranslateDirection
  createdAt: number
}

export type ThemePreference = 'system' | 'light' | 'dark'

export interface Preferences {
  theme: ThemePreference
  manualDirection: TranslateDirection
  promptStyle: PromptStyle
  recentModels: string[]
  shortcutDowngradeAcknowledged: boolean
  autoHideOnBlur: boolean
  customShortcut: string | null
}
