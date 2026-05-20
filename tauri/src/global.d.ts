import type { ApiSettings, HistoryEntry, Preferences, TranslationState } from './lib/types'

export {}

declare global {
  interface Window {
    lazyTrans: {
      onTranslationUpdate: (callback: (state: TranslationState) => void) => () => void
      onOpenSettingsRequest: (callback: () => void) => () => void
      translateInput: (text: string) => Promise<void>
      cancelTranslation: () => Promise<void>
      updateManualInput: (text: string) => Promise<void>
      hideWindow: () => Promise<void>
      getApiSettings: () => Promise<ApiSettings>
      saveApiSettings: (settings: ApiSettings) => Promise<ApiSettings>
      testApiSettings: (settings: ApiSettings) => Promise<{ ok: boolean }>
      openAccessibilitySettings: () => Promise<void>
      listHistory: () => Promise<HistoryEntry[]>
      clearHistory: () => Promise<void>
      removeHistoryEntry: (id: string) => Promise<HistoryEntry[]>
      translateHistoryEntry: (id: string) => Promise<void>
      getPreferences: () => Promise<Preferences>
      patchPreferences: (patch: Partial<Preferences>) => Promise<Preferences>
    }
  }
}
