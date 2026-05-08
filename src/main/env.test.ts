import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { loadDotEnvFile, loadDotEnvFiles, parseDotEnv } from './env'

let tempDir: string | null = null

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true })
    tempDir = null
  }
})

describe('dotenv loading', () => {
  it('parses export-prefixed dotenv values', () => {
    expect(
      parseDotEnv([
        'export TRANSLATE_API_KEY=test-key',
        'export TRANSLATE_API_URL=https://api.example.com/v1',
        'TRANSLATE_MODEL=\"test-model\"'
      ].join('\n'))
    ).toEqual({
      TRANSLATE_API_KEY: 'test-key',
      TRANSLATE_API_URL: 'https://api.example.com/v1',
      TRANSLATE_MODEL: 'test-model'
    })
  })

  it('loads missing values without overwriting existing process env', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'lazytrans-env-'))
    const envPath = join(tempDir, '.env')
    writeFileSync(
      envPath,
      [
        'export TRANSLATE_API_KEY=file-key',
        'export TRANSLATE_API_URL=https://api.example.com/v1',
        'TRANSLATE_MODEL=file-model'
      ].join('\n')
    )

    const env: NodeJS.ProcessEnv = {
      TRANSLATE_API_KEY: 'existing-key'
    }

    loadDotEnvFile(envPath, env)

    expect(env).toEqual({
      TRANSLATE_API_KEY: 'existing-key',
      TRANSLATE_API_URL: 'https://api.example.com/v1',
      TRANSLATE_MODEL: 'file-model'
    })
  })

  it('loads multiple dotenv files in order without overriding existing values', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'lazytrans-env-'))
    const firstPath = join(tempDir, '.env')
    const secondPath = join(tempDir, 'fallback.env')
    writeFileSync(firstPath, 'TRANSLATE_MODEL=first-model\n')
    writeFileSync(secondPath, 'TRANSLATE_MODEL=second-model\nTRANSLATE_API_KEY=second-key\n')

    const env: NodeJS.ProcessEnv = {}

    loadDotEnvFiles([firstPath, secondPath], env)

    expect(env).toEqual({
      TRANSLATE_MODEL: 'first-model',
      TRANSLATE_API_KEY: 'second-key'
    })
  })
})
