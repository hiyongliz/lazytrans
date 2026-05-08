import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  TRANSLATE_SYSTEM_PROMPT,
  buildChatCompletionsUrl,
  readTranslateConfig,
  translateText
} from './translator'

describe('translator configuration', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses OpenAI defaults', () => {
    const config = readTranslateConfig({
      OPENAI_API_KEY: 'test-key'
    })

    expect(config).toEqual({
      apiKey: 'test-key',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini'
    })
    expect(buildChatCompletionsUrl(config.baseUrl)).toBe(
      'https://api.openai.com/v1/chat/completions'
    )
  })

  it('tells the model it is a translation assistant', () => {
    expect(TRANSLATE_SYSTEM_PROMPT).toContain('你是一个翻译助手')
  })

  it('instructs the model to translate Chinese to English and other languages to Chinese', () => {
    expect(TRANSLATE_SYSTEM_PROMPT).toContain('中文翻译成英文')
    expect(TRANSLATE_SYSTEM_PROMPT).toContain('非中文翻译成中文')
  })

  it('uses a programmer-oriented translation style', () => {
    expect(TRANSLATE_SYSTEM_PROMPT).toContain('程序员风格')
    expect(TRANSLATE_SYSTEM_PROMPT).toContain('保留代码')
    expect(TRANSLATE_SYSTEM_PROMPT).toContain('技术术语')
  })

  it('allows provider overrides with TRANSLATE environment variables', () => {
    const config = readTranslateConfig({
      OPENAI_API_KEY: 'openai-key',
      TRANSLATE_API_KEY: 'provider-key',
      TRANSLATE_API_BASE_URL: 'https://api.example.com/v1',
      TRANSLATE_MODEL: 'provider-model'
    })

    expect(config).toEqual({
      apiKey: 'provider-key',
      baseUrl: 'https://api.example.com/v1',
      model: 'provider-model'
    })
  })

  it('accepts TRANSLATE_API_URL as an alias for the provider base URL', () => {
    const config = readTranslateConfig({
      TRANSLATE_API_KEY: 'provider-key',
      TRANSLATE_API_URL: 'https://api.example.com/v1',
      TRANSLATE_MODEL: 'provider-model'
    })

    expect(config).toEqual({
      apiKey: 'provider-key',
      baseUrl: 'https://api.example.com/v1',
      model: 'provider-model'
    })
  })

  it('rejects translation when the API key is missing', async () => {
    await expect(
      translateText('hello', {
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4.1-mini'
      })
    ).rejects.toThrow('OPENAI_API_KEY or TRANSLATE_API_KEY')
  })

  it('passes an abort signal to fetch so stalled API requests can be cancelled', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '你好'
              }
            }
          ]
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      translateText('hello', {
        apiKey: 'test-key',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4.1-mini'
      })
    ).resolves.toBe('你好')
  })
})
