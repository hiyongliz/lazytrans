import { describe, expect, it, vi } from 'vitest'

const exposedApi = vi.hoisted(() => ({ value: undefined as unknown }))
const invokeMock = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: vi.fn((_key: string, api: unknown) => {
      exposedApi.value = api
    })
  },
  ipcRenderer: {
    invoke: invokeMock,
    on: vi.fn(),
    removeListener: vi.fn()
  }
}))

describe('preload api', () => {
  it('exposes manual text translation over IPC', async () => {
    await import('./index')

    const api = exposedApi.value as {
      translateInput(text: string): Promise<void>
      cancelTranslation(): Promise<void>
      updateManualInput(text: string): Promise<void>
      hideWindow(): Promise<void>
      getApiSettings(): Promise<unknown>
      saveApiSettings(settings: unknown): Promise<unknown>
      testApiSettings(settings: unknown): Promise<unknown>
      openAccessibilitySettings(): Promise<void>
      listHistory(): Promise<unknown>
      clearHistory(): Promise<void>
      translateHistoryEntry(id: string): Promise<void>
      getPreferences(): Promise<unknown>
      patchPreferences(patch: unknown): Promise<unknown>
    }

    await api.translateInput('hello')
    await api.cancelTranslation()
    await api.updateManualInput('draft text')
    await api.hideWindow()
    await api.getApiSettings()
    await api.saveApiSettings({
      apiKey: 'test-key',
      baseUrl: 'https://api.example.com/v1',
      model: 'test-model'
    })
    await api.testApiSettings({
      apiKey: 'test-key',
      baseUrl: '',
      model: ''
    })
    await api.openAccessibilitySettings()
    await api.listHistory()
    await api.clearHistory()
    await api.translateHistoryEntry('id-1')
    await api.getPreferences()
    await api.patchPreferences({ theme: 'dark' })

    expect(invokeMock).toHaveBeenCalledWith('translation:manual-translate', 'hello')
    expect(invokeMock).toHaveBeenCalledWith('translation:cancel')
    expect(invokeMock).toHaveBeenCalledWith('translation:update-manual-input', 'draft text')
    expect(invokeMock).toHaveBeenCalledWith('window:hide')
    expect(invokeMock).toHaveBeenCalledWith('settings:get-api')
    expect(invokeMock).toHaveBeenCalledWith('settings:save-api', {
      apiKey: 'test-key',
      baseUrl: 'https://api.example.com/v1',
      model: 'test-model'
    })
    expect(invokeMock).toHaveBeenCalledWith('settings:test-api', {
      apiKey: 'test-key',
      baseUrl: '',
      model: ''
    })
    expect(invokeMock).toHaveBeenCalledWith('system:open-accessibility-settings')
    expect(invokeMock).toHaveBeenCalledWith('history:list')
    expect(invokeMock).toHaveBeenCalledWith('history:clear')
    expect(invokeMock).toHaveBeenCalledWith('history:translate-id', 'id-1')
    expect(invokeMock).toHaveBeenCalledWith('prefs:get')
    expect(invokeMock).toHaveBeenCalledWith('prefs:patch', { theme: 'dark' })
  })
})
