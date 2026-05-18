import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  Tray: vi.fn(),
  Menu: { buildFromTemplate: vi.fn() },
  nativeImage: { createFromPath: vi.fn(() => ({})) }
}))

import { buildTemplate, createTrayMenu, type TrayMenuCallbacks } from './tray'

function makeCallbacks(overrides: Partial<TrayMenuCallbacks> = {}): TrayMenuCallbacks {
  return {
    onShow: vi.fn(),
    onSettings: vi.fn(),
    onTranslateHistoryEntry: vi.fn(),
    onClearHistory: vi.fn(),
    onQuit: vi.fn(),
    getRecentHistory: () => [],
    ...overrides
  }
}

describe('tray menu template', () => {
  it('lists primary actions in a fixed order', () => {
    const callbacks = makeCallbacks()
    const template = buildTemplate(callbacks)
    const labels = template.map((item) => item.label ?? item.type)
    expect(labels).toEqual([
      '显示 LazyTrans',
      'separator',
      '最近翻译',
      '清空历史',
      'separator',
      '设置…',
      '退出 LazyTrans'
    ])
  })

  it('shows a disabled "no history" item when nothing is cached', () => {
    const template = buildTemplate(makeCallbacks({ getRecentHistory: () => [] }))
    const recentItem = template.find((item) => item.label === '最近翻译')
    const submenu = recentItem?.submenu as Electron.MenuItemConstructorOptions[]
    expect(submenu).toEqual([{ label: '暂无历史', enabled: false }])

    const clearItem = template.find((item) => item.label === '清空历史')
    expect(clearItem?.enabled).toBe(false)
  })

  it('shows up to ten history entries with truncated labels', () => {
    const entries = Array.from({ length: 12 }, (_, index) => ({
      id: `id-${index}`,
      sourceText: `source-text-that-is-quite-long-${index}`.padEnd(40, 'x')
    }))
    const template = buildTemplate(
      makeCallbacks({ getRecentHistory: () => entries })
    )
    const submenu = template.find((item) => item.label === '最近翻译')
      ?.submenu as Electron.MenuItemConstructorOptions[]
    expect(submenu).toHaveLength(10)
    for (const item of submenu) {
      expect(item.label?.length).toBeLessThanOrEqual(30)
    }
  })

  it('wires click handlers to the matching callback with the entry id', () => {
    const onTranslateHistoryEntry = vi.fn()
    const template = buildTemplate(
      makeCallbacks({
        onTranslateHistoryEntry,
        getRecentHistory: () => [{ id: 'abc', sourceText: 'hello' }]
      })
    )
    const submenu = template.find((item) => item.label === '最近翻译')
      ?.submenu as Electron.MenuItemConstructorOptions[]
    submenu[0]?.click?.(
      undefined as never,
      undefined as never,
      undefined as never
    )
    expect(onTranslateHistoryEntry).toHaveBeenCalledWith('abc')
  })
})

describe('tray menu construction', () => {
  it('builds the tray with the icon, tooltip, and a click handler that triggers onShow', () => {
    const trayInstance = {
      setContextMenu: vi.fn(),
      setToolTip: vi.fn(),
      on: vi.fn()
    }
    const TrayCtor = vi.fn(() => trayInstance) as unknown as typeof import('electron').Tray
    const MenuCtor = { buildFromTemplate: vi.fn((template) => template) }
    const imageInstance = { setTemplateImage: vi.fn() } as unknown as Electron.NativeImage
    const createImage = vi.fn(() => imageInstance)

    const callbacks = makeCallbacks()
    const handle = createTrayMenu('/path/to/icon.png', callbacks, {
      TrayCtor,
      MenuCtor,
      createImage
    })

    expect(createImage).toHaveBeenCalledWith('/path/to/icon.png')
    expect(imageInstance.setTemplateImage).toHaveBeenCalledWith(true)
    expect(TrayCtor).toHaveBeenCalledWith(imageInstance)
    expect(trayInstance.setToolTip).toHaveBeenCalledWith('LazyTrans')
    expect(MenuCtor.buildFromTemplate).toHaveBeenCalled()
    expect(trayInstance.setContextMenu).toHaveBeenCalled()

    const clickHandler = trayInstance.on.mock.calls.find(
      (args) => args[0] === 'click'
    )?.[1] as (() => void) | undefined
    clickHandler?.()
    expect(callbacks.onShow).toHaveBeenCalled()

    handle.refresh()
    expect(trayInstance.setContextMenu).toHaveBeenCalledTimes(2)
  })
})
