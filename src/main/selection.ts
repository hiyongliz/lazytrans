import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { clipboard } from 'electron'

const execFileAsync = promisify(execFile)
const CLIPBOARD_POLL_INTERVAL_MS = 20
const CLIPBOARD_POLL_TIMEOUT_MS = 320
const FOCUS_RESTORE_DELAY_MS = 90
const COPY_COMMAND_TIMEOUT_MS = 2000
const COPY_SELECTION_SCRIPT =
  'tell application "System Events" to keystroke "c" using command down'
const READ_SELECTED_TEXT_SCRIPT = `
tell application "System Events"
  set frontApp to first application process whose frontmost is true
  try
    set focusedElement to value of attribute "AXFocusedUIElement" of frontApp
    set selectedText to value of attribute "AXSelectedText" of focusedElement
    if selectedText is not missing value then return selectedText
  end try
end tell
return ""
`

export interface GetSelectedTextOptions {
  beforeCopy?: () => void | Promise<void>
}

export async function getSelectedText(options: GetSelectedTextOptions = {}): Promise<string> {
  const accessibilityText = await getAccessibilitySelectedText()
  if (accessibilityText) {
    return accessibilityText
  }

  const previousText = clipboard.readText()

  try {
    await options.beforeCopy?.()
    await delay(FOCUS_RESTORE_DELAY_MS)
    clipboard.writeText('')
    await execFileAsync('/usr/bin/osascript', ['-e', COPY_SELECTION_SCRIPT], {
      timeout: COPY_COMMAND_TIMEOUT_MS
    })

    return waitForClipboardTextChange(previousText)
  } catch (error) {
    throw new Error(`osascript 执行失败: ${formatScriptError(error)}`)
  } finally {
    clipboard.writeText(previousText)
  }
}

async function waitForClipboardTextChange(previousText: string): Promise<string> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < CLIPBOARD_POLL_TIMEOUT_MS) {
    const currentText = clipboard.readText()
    if (currentText && currentText !== previousText) {
      return currentText.trim()
    }

    await delay(CLIPBOARD_POLL_INTERVAL_MS)
  }

  return clipboard.readText().trim()
}

async function getAccessibilitySelectedText(): Promise<string> {
  try {
    const result = await execFileAsync('/usr/bin/osascript', ['-e', READ_SELECTED_TEXT_SCRIPT], {
      timeout: COPY_COMMAND_TIMEOUT_MS
    })

    return readStdout(result).trim()
  } catch {
    return ''
  }
}

function readStdout(result: unknown): string {
  if (typeof result === 'string') {
    return result
  }

  if (result && typeof result === 'object' && 'stdout' in result) {
    return String((result as { stdout?: unknown }).stdout ?? '')
  }

  return ''
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function formatScriptError(error: unknown): string {
  if (error && typeof error === 'object' && 'stderr' in error) {
    const stderr = String((error as { stderr?: unknown }).stderr ?? '').trim()
    if (stderr) {
      return stderr
    }
  }

  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
