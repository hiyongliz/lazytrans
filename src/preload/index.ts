import { contextBridge, ipcRenderer } from 'electron'

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
  translateInput(text: string): Promise<void> {
    return ipcRenderer.invoke('translation:manual-translate', text)
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
  }
})
