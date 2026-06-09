import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type {
  ApiSettings, HistoryEntry, Preferences, TranslationState
} from './types'

type Unsubscribe = () => void

function subscribe<T>(name: string, cb: (payload: T) => void): Unsubscribe {
  let unlisten: UnlistenFn | undefined
  let cancelled = false
  listen<T>(name, (event) => cb(event.payload)).then((fn) => {
    if (cancelled) fn(); else unlisten = fn
  })
  return () => { cancelled = true; unlisten?.() }
}

export const lazyTrans = {
  onTranslationUpdate: (cb: (s: TranslationState) => void) =>
    subscribe('translation:update', cb),
  onOpenSettingsRequest: (cb: () => void) =>
    subscribe<null>('app:open-settings-request', () => cb()),

  translateInput:        (text: string) => invoke<void>('translate_input', { text }),
  cancelTranslation:     ()             => invoke<void>('cancel_translation'),
  updateManualInput:     (text: string) => invoke<void>('update_manual_input', { text }),
  hideWindow:            ()             => invoke<void>('hide_window'),
  getApiSettings:        ()             => invoke<ApiSettings>('get_api_settings'),
  saveApiSettings:       (s: ApiSettings) => invoke<ApiSettings>('save_api_settings', { settings: s }),
  testApiSettings:       (s: ApiSettings) => invoke<{ ok: boolean }>('test_api_settings', { settings: s }),
  openAccessibilitySettings: () => invoke<void>('open_accessibility_settings'),
  listHistory:           ()             => invoke<HistoryEntry[]>('list_history'),
  clearHistory:          ()             => invoke<void>('clear_history'),
  removeHistoryEntry:    (id: string)   => invoke<HistoryEntry[]>('remove_history_entry', { id }),
  translateHistoryEntry: (id: string)   => invoke<void>('translate_history_entry', { id }),
  getPreferences:        ()             => invoke<Preferences>('get_preferences'),
  getShortcutLabel:      ()             => invoke<string>('get_shortcut_label'),
  patchPreferences:      (patch: Partial<Preferences>) =>
    invoke<Preferences>('patch_preferences', { patch }),
  writeClipboard:        (text: string)  => invoke<void>('write_clipboard', { text }),
  setCustomShortcut:     (accelerator: string | null) =>
    invoke<string>('set_custom_shortcut', { accelerator }),
  exportHistory:         (format: 'json' | 'markdown') =>
    invoke<string>('export_history', { format })
}

window.lazyTrans = lazyTrans
