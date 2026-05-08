export interface ManagedWindow {
  isDestroyed(): boolean
}

export function ensureTranslateWindow<TWindow extends ManagedWindow>(
  currentWindow: TWindow | null,
  createWindow: () => TWindow
): TWindow {
  if (currentWindow && !currentWindow.isDestroyed()) {
    return currentWindow
  }

  return createWindow()
}
