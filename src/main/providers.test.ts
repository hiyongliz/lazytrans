import { describe, expect, it } from 'vitest'

import {
  PROVIDER_PRESETS,
  findProviderByBaseUrl,
  findProviderById
} from './providers'

describe('provider presets', () => {
  it('includes the common OpenAI-compatible providers', () => {
    const ids = PROVIDER_PRESETS.map((preset) => preset.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        'openai',
        'deepseek',
        'zhipu',
        'dashscope',
        'openrouter',
        'ollama'
      ])
    )
  })

  it('every preset ships a non-empty baseUrl and defaultModel', () => {
    for (const preset of PROVIDER_PRESETS) {
      expect(preset.baseUrl).toMatch(/^https?:\/\//)
      expect(preset.defaultModel.trim()).not.toBe('')
    }
  })

  it('finds preset by baseUrl regardless of trailing slash and casing', () => {
    expect(findProviderByBaseUrl('https://api.openai.com/v1')?.id).toBe('openai')
    expect(findProviderByBaseUrl('https://API.openai.com/v1///')?.id).toBe('openai')
  })

  it('returns undefined for unknown baseUrls', () => {
    expect(findProviderByBaseUrl('')).toBeUndefined()
    expect(findProviderByBaseUrl('https://example.com/v1')).toBeUndefined()
  })

  it('looks up preset by id', () => {
    expect(findProviderById('ollama')?.baseUrl).toBe('http://127.0.0.1:11434/v1')
    expect(findProviderById('nope')).toBeUndefined()
  })
})
