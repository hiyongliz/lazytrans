import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { readWindowState, writeWindowState } from './window-state'

describe('window state persistence', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'lazytrans-windowstate-'))
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('returns null bounds when no state file exists', () => {
    expect(readWindowState(join(tempDir, 'state.json'))).toEqual({
      bounds: null
    })
  })

  it('round-trips bounds through write and read', () => {
    const path = join(tempDir, 'state.json')
    writeWindowState(path, {
      bounds: { x: 100, y: 200, width: 460, height: 520 }
    })

    expect(readWindowState(path)).toEqual({
      bounds: { x: 100, y: 200, width: 460, height: 520 }
    })
  })

  it('treats a corrupted state file as no bounds', () => {
    const path = join(tempDir, 'state.json')
    writeFileSync(path, '{garbage')

    expect(readWindowState(path)).toEqual({ bounds: null })
  })

  it('rejects non-numeric bounds fields', () => {
    const path = join(tempDir, 'state.json')
    writeFileSync(
      path,
      JSON.stringify({
        bounds: { x: 'a', y: 1, width: 1, height: 1 }
      })
    )

    expect(readWindowState(path)).toEqual({ bounds: null })
  })

  it('rejects non-positive width or height', () => {
    const path = join(tempDir, 'state.json')
    writeFileSync(
      path,
      JSON.stringify({
        bounds: { x: 1, y: 1, width: 0, height: 100 }
      })
    )

    expect(readWindowState(path)).toEqual({ bounds: null })
  })

  it('rejects non-finite coordinates', () => {
    const path = join(tempDir, 'state.json')
    writeFileSync(
      path,
      JSON.stringify({
        bounds: { x: Number.POSITIVE_INFINITY, y: 1, width: 1, height: 1 }
      })
    )

    // JSON.stringify converts Infinity to null, so this becomes a null x test
    expect(readWindowState(path)).toEqual({ bounds: null })
  })
})
