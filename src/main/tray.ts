import { Menu, Tray, nativeImage } from 'electron'

export interface TrayHistoryEntry {
  id: string
  sourceText: string
}

export interface TrayMenuCallbacks {
  onShow: () => void
  onSettings: () => void
  onTranslateHistoryEntry: (id: string) => void
  onClearHistory: () => void
  onQuit: () => void
  getRecentHistory: () => TrayHistoryEntry[]
}

export interface TrayMenuDeps {
  TrayCtor?: typeof Tray
  MenuCtor?: { buildFromTemplate: typeof Menu.buildFromTemplate }
  createImage?: (path: string) => Electron.NativeImage
}

export interface TrayMenuHandle {
  tray: Pick<Tray, 'setContextMenu' | 'setToolTip' | 'on'> & {
    destroy?: () => void
  }
  refresh: () => void
}

const HISTORY_PREVIEW_LIMIT = 10
const HISTORY_LABEL_MAX_LENGTH = 30

export function createTrayMenu(
  iconPath: string,
  callbacks: TrayMenuCallbacks,
  deps: TrayMenuDeps = {}
): TrayMenuHandle {
  const TrayCtor = deps.TrayCtor ?? Tray
  const MenuCtor = deps.MenuCtor ?? Menu
  const createImage =
    deps.createImage ?? ((path: string) => nativeImage.createFromPath(path))

  const image = createImage(iconPath)
  image.setTemplateImage(true)
  const tray = new TrayCtor(image)
  tray.setToolTip('LazyTrans')

  const refresh = (): void => {
    tray.setContextMenu(MenuCtor.buildFromTemplate(buildTemplate(callbacks)))
  }

  refresh()
  tray.on('click', () => callbacks.onShow())

  return { tray, refresh }
}

export function buildTemplate(
  callbacks: TrayMenuCallbacks
): Electron.MenuItemConstructorOptions[] {
  const recent = callbacks.getRecentHistory().slice(0, HISTORY_PREVIEW_LIMIT)
  const historySubmenu: Electron.MenuItemConstructorOptions[] =
    recent.length === 0
      ? [{ label: '暂无历史', enabled: false }]
      : recent.map((entry) => ({
          label: truncate(entry.sourceText, HISTORY_LABEL_MAX_LENGTH),
          click: (): void => callbacks.onTranslateHistoryEntry(entry.id)
        }))

  return [
    { label: '显示 LazyTrans', click: (): void => callbacks.onShow() },
    { type: 'separator' },
    { label: '最近翻译', submenu: historySubmenu },
    {
      label: '清空历史',
      enabled: recent.length > 0,
      click: (): void => callbacks.onClearHistory()
    },
    { type: 'separator' },
    { label: '设置…', click: (): void => callbacks.onSettings() },
    { label: '退出 LazyTrans', click: (): void => callbacks.onQuit() }
  ]
}

function truncate(text: string, max: number): string {
  const single = text.replace(/\s+/g, ' ').trim()
  if (single.length <= max) {
    return single
  }
  return `${single.slice(0, max - 1)}…`
}
