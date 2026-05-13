import { contextBridge, ipcRenderer } from 'electron'

import type { HistoryEntry } from '../main/history'
import type { ApiSettings } from '../main/settings'
import type { TranslationState } from '../main/window'

contextBridge.exposeInMainWorld('lazyTrans', {
  onTranslationUpdate(callback: (state: TranslationState) => void) {
    const listener = (_event: Electron.IpcRendererEvent, state: TranslationState): void => {
      callback(state)
    }

    ipcRenderer.on('translation:update', listener)

    return (): void => {
      ipcRenderer.removeListener('translation:update', listener)
    }
  },
  onOpenSettingsRequest(callback: () => void) {
    const listener = (): void => callback()
    ipcRenderer.on('app:open-settings-request', listener)

    return (): void => {
      ipcRenderer.removeListener('app:open-settings-request', listener)
    }
  },
  translateInput(text: string): Promise<void> {
    return ipcRenderer.invoke('translation:manual-translate', text)
  },
  cancelTranslation(): Promise<void> {
    return ipcRenderer.invoke('translation:cancel')
  },
  updateManualInput(text: string): Promise<void> {
    return ipcRenderer.invoke('translation:update-manual-input', text)
  },
  hideWindow(): Promise<void> {
    return ipcRenderer.invoke('window:hide')
  },
  getApiSettings(): Promise<ApiSettings> {
    return ipcRenderer.invoke('settings:get-api')
  },
  saveApiSettings(settings: ApiSettings): Promise<ApiSettings> {
    return ipcRenderer.invoke('settings:save-api', settings)
  },
  testApiSettings(settings: ApiSettings): Promise<{ ok: boolean }> {
    return ipcRenderer.invoke('settings:test-api', settings)
  },
  openAccessibilitySettings(): Promise<void> {
    return ipcRenderer.invoke('system:open-accessibility-settings')
  },
  listHistory(): Promise<HistoryEntry[]> {
    return ipcRenderer.invoke('history:list')
  },
  clearHistory(): Promise<void> {
    return ipcRenderer.invoke('history:clear')
  },
  translateHistoryEntry(id: string): Promise<void> {
    return ipcRenderer.invoke('history:translate-id', id)
  }
})
