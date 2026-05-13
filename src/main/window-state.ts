import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface WindowState {
  bounds: WindowBounds | null
}

export function readWindowState(path: string): WindowState {
  if (!existsSync(path)) {
    return { bounds: null }
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    return { bounds: normalizeBounds(parsed?.bounds) }
  } catch {
    return { bounds: null }
  }
}

export function writeWindowState(path: string, state: WindowState): void {
  mkdirSync(dirname(path), { recursive: true })
  const tempPath = `${path}.tmp`
  writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`)
  renameSync(tempPath, path)
}

function normalizeBounds(value: unknown): WindowBounds | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const raw = value as Partial<Record<keyof WindowBounds, unknown>>
  if (
    typeof raw.x !== 'number' ||
    typeof raw.y !== 'number' ||
    typeof raw.width !== 'number' ||
    typeof raw.height !== 'number'
  ) {
    return null
  }

  if (!Number.isFinite(raw.x) || !Number.isFinite(raw.y)) {
    return null
  }

  if (raw.width <= 0 || raw.height <= 0) {
    return null
  }

  return {
    x: raw.x,
    y: raw.y,
    width: raw.width,
    height: raw.height
  }
}
