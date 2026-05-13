import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'

import type { TranslationErrorCode } from './translation-errors'

export type TranslationStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error' | 'cancelled'
export type TranslationPhase = 'reading-selection' | 'translating'

export interface TranslationState {
  status: TranslationStatus
  phase?: TranslationPhase
  sourceText: string
  translatedText: string
  errorMessage: string
  errorCode?: TranslationErrorCode
  shortcutLabel?: string
  manualInputText?: string
}

const WINDOW_WIDTH = 460
const WINDOW_HEIGHT = 520
const WINDOW_MARGIN = 18
const pendingTranslationStates = new WeakMap<BrowserWindow, TranslationState>()
const pendingFlushHandlers = new WeakSet<BrowserWindow>()
let lastWindowBounds: Electron.Rectangle | null = null

interface ShowTranslateWindowOptions {
  focus?: boolean
  reposition?: boolean
}

interface CreateTranslateWindowOptions {
  shouldHideOnClose?: () => boolean
  initialBounds?: Electron.Rectangle | null
  onBoundsChange?: (bounds: Electron.Rectangle) => void
}

export function createTranslateWindow(
  options: CreateTranslateWindowOptions = {}
): BrowserWindow {
  const initialBounds = options.initialBounds ?? null
  const window = new BrowserWindow({
    width: initialBounds?.width ?? WINDOW_WIDTH,
    height: initialBounds?.height ?? WINDOW_HEIGHT,
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

  if (initialBounds) {
    lastWindowBounds = initialBounds
    window.setBounds(initialBounds)
  }

  window.setAlwaysOnTop(true, 'floating')
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  const rememberWindowBounds = (): void => {
    if (window.isDestroyed()) {
      return
    }
    const bounds = window.getBounds()
    lastWindowBounds = bounds
    options.onBoundsChange?.(bounds)
  }
  window.on('resize', rememberWindowBounds)
  window.on('move', rememberWindowBounds)
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
  } else if (!window.isVisible() && lastWindowBounds) {
    restoreWindowBounds(window, lastWindowBounds)
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
  const bounds = window.getBounds()
  const width = bounds.width || WINDOW_WIDTH
  const height = bounds.height || WINDOW_HEIGHT

  const preferredX = cursorPoint.x - Math.round(width / 2)
  const preferredY = cursorPoint.y + WINDOW_MARGIN
  const maxX = workArea.x + workArea.width - width - WINDOW_MARGIN
  const maxY = workArea.y + workArea.height - height - WINDOW_MARGIN

  const x = clamp(preferredX, workArea.x + WINDOW_MARGIN, maxX)
  const y = clamp(preferredY, workArea.y + WINDOW_MARGIN, maxY)

  window.setBounds({
    x,
    y,
    width,
    height
  })
}

function restoreWindowBounds(window: BrowserWindow, bounds: Electron.Rectangle): void {
  const display = screen.getDisplayNearestPoint({
    x: bounds.x + Math.round(bounds.width / 2),
    y: bounds.y + Math.round(bounds.height / 2)
  })
  const workArea = display.workArea
  const x = clamp(
    bounds.x,
    workArea.x + WINDOW_MARGIN,
    workArea.x + workArea.width - bounds.width - WINDOW_MARGIN
  )
  const y = clamp(
    bounds.y,
    workArea.y + WINDOW_MARGIN,
    workArea.y + workArea.height - bounds.height - WINDOW_MARGIN
  )

  window.setBounds({
    ...bounds,
    x,
    y
  })
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min
  }

  return Math.min(Math.max(value, min), max)
}
