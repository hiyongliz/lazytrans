import type { ApiSettings } from '../../main/settings'
import type { TranslationState } from '../../main/window'

export {}

declare global {
  interface Window {
    lazyTrans: {
      onTranslationUpdate: (callback: (state: TranslationState) => void) => () => void
      translateInput: (text: string) => Promise<void>
      cancelTranslation: () => Promise<void>
      updateManualInput: (text: string) => Promise<void>
      hideWindow: () => Promise<void>
      getApiSettings: () => Promise<ApiSettings>
      saveApiSettings: (settings: ApiSettings) => Promise<ApiSettings>
      testApiSettings: (settings: ApiSettings) => Promise<{ ok: boolean }>
      openAccessibilitySettings: () => Promise<void>
    }
  }
}
