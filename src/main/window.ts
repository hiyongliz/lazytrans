import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'

export type TranslationStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error'

export interface TranslationState {
  status: TranslationStatus
  sourceText: string
  translatedText: string
  errorMessage: string
  shortcutLabel?: string
  manualInputText?: string
}

const WINDOW_WIDTH = 460
const WINDOW_HEIGHT = 520
const WINDOW_MARGIN = 18
const pendingTranslationStates = new WeakMap<BrowserWindow, TranslationState>()
const pendingFlushHandlers = new WeakSet<BrowserWindow>()

interface ShowTranslateWindowOptions {
  focus?: boolean
  reposition?: boolean
}

interface CreateTranslateWindowOptions {
  shouldHideOnClose?: () => boolean
}

export function createTranslateWindow(
  options: CreateTranslateWindowOptions = {}
): BrowserWindow {
  const window = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: 360,
    minHeight: 400,
    show: false,
    frame: false,
    transparent: true,
    focusable: false,
    skipTaskbar: true,
    resizable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    hasShadow: true,
    title: 'LazyTrans',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  window.setAlwaysOnTop(true, 'floating')
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  window.on('close', (event) => {
    if (options.shouldHideOnClose?.() === false) {
      return
    }

    event.preventDefault()
    window.hide()
  })
  window.webContents.on('did-finish-load', () => {
    console.info('Translate window renderer loaded')
  })
  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(
      `Translate window renderer failed to load: ${errorCode} ${errorDescription} ${validatedURL}`
    )
  })
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error(`Translate window renderer gone: ${details.reason}`)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

export function showTranslateWindow(
  window: BrowserWindow,
  options: ShowTranslateWindowOptions = {}
): void {
  if (window.isDestroyed()) {
    console.error('Translate window cannot be shown because it has been destroyed')
    return
  }

  if (window.isMinimized()) {
    window.restore()
  }

  if (options.reposition !== false) {
    positionWindowNearCursor(window)
  }
  window.setFocusable(true)
  window.setAlwaysOnTop(true, 'floating')

  if (options.focus === true) {
    window.show()
    window.focus()
  } else {
    window.showInactive()
  }

  window.moveTop()

  const bounds = window.getBounds()
  console.info(
    `Translate window show requested: visible=${window.isVisible()} bounds=${bounds.x},${bounds.y},${bounds.width}x${bounds.height}`
  )
}

export function sendTranslationState(window: BrowserWindow, state: TranslationState): void {
  const send = (): void => {
    const nextState = pendingTranslationStates.get(window) ?? state
    pendingTranslationStates.delete(window)
    pendingFlushHandlers.delete(window)
    window.webContents.send('translation:update', nextState)
  }

  if (window.webContents.isLoading()) {
    pendingTranslationStates.set(window, state)
    if (!pendingFlushHandlers.has(window)) {
      pendingFlushHandlers.add(window)
      window.webContents.once('did-finish-load', send)
    }
    return
  }

  send()
}

export async function readCurrentManualInputText(window: BrowserWindow): Promise<string> {
  try {
    const value = await window.webContents.executeJavaScript(
      `document.querySelector('[data-manual-input="true"]')?.value ?? ''`
    )

    return typeof value === 'string' ? value : ''
  } catch {
    return ''
  }
}

function positionWindowNearCursor(window: BrowserWindow): void {
  const cursorPoint = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursorPoint)
  const workArea = display.workArea

  const preferredX = cursorPoint.x - Math.round(WINDOW_WIDTH / 2)
  const preferredY = cursorPoint.y + WINDOW_MARGIN
  const maxX = workArea.x + workArea.width - WINDOW_WIDTH - WINDOW_MARGIN
  const maxY = workArea.y + workArea.height - WINDOW_HEIGHT - WINDOW_MARGIN

  const x = clamp(preferredX, workArea.x + WINDOW_MARGIN, maxX)
  const y = clamp(preferredY, workArea.y + WINDOW_MARGIN, maxY)

  window.setBounds({
    x,
    y,
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT
  })
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min
  }

  return Math.min(Math.max(value, min), max)
}
