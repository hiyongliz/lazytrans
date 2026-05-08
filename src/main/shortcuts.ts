export interface ShortcutRegistrar {
  register(accelerator: string, callback: () => void): boolean
}

interface ShortcutCandidate {
  accelerator: string
  label: string
}

export type ShortcutRegistrationResult =
  | {
      status: 'registered'
      accelerator: string
      label: string
      usedFallback: boolean
    }
  | {
      status: 'failed'
      attemptedLabels: string[]
    }

const TRANSLATE_SHORTCUTS: ShortcutCandidate[] = [
  {
    accelerator: 'Alt+D',
    label: 'Option + D'
  },
  {
    accelerator: 'CommandOrControl+Shift+D',
    label: process.platform === 'darwin' ? 'Command + Shift + D' : 'Ctrl + Shift + D'
  }
]

export function registerTranslateShortcut(
  globalShortcut: ShortcutRegistrar,
  callback: () => void
): ShortcutRegistrationResult {
  for (const [index, shortcut] of TRANSLATE_SHORTCUTS.entries()) {
    const registered = globalShortcut.register(shortcut.accelerator, callback)
    if (registered) {
      return {
        status: 'registered',
        accelerator: shortcut.accelerator,
        label: shortcut.label,
        usedFallback: index > 0
      }
    }
  }

  return {
    status: 'failed',
    attemptedLabels: TRANSLATE_SHORTCUTS.map((shortcut) => shortcut.label)
  }
}
