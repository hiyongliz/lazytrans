import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  applyApiSettingsToEnv,
  readApiSettings,
  writeApiSettings,
  type ApiSettings
} from './settings'

let tempDir: string | null = null

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true })
    tempDir = null
  }
})

describe('api settings storage', () => {
  it('returns empty settings when no settings file exists', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'lazytrans-settings-'))

    expect(readApiSettings(join(tempDir, 'settings.json'))).toEqual({})
  })

  it('writes and reads API settings', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'lazytrans-settings-'))
    const path = join(tempDir, 'settings.json')
    const settings: ApiSettings = {
      apiKey: 'test-key',
      baseUrl: 'https://api.example.com/v1',
      model: 'test-model'
    }

    writeApiSettings(path, settings)

    expect(readApiSettings(path)).toEqual(settings)
  })

  it('applies settings to process env values used by the translator', () => {
    const env: NodeJS.ProcessEnv = {}

    applyApiSettingsToEnv(
      {
        apiKey: 'test-key',
        baseUrl: 'https://api.example.com/v1',
        model: 'test-model'
      },
      env
    )

    expect(env).toEqual({
      TRANSLATE_API_KEY: 'test-key',
      TRANSLATE_API_BASE_URL: 'https://api.example.com/v1',
      TRANSLATE_MODEL: 'test-model'
    })
  })
})
