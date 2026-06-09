export interface ProviderPreset {
  id: string
  name: string
  baseUrl: string
  defaultModel: string
  hint?: string
}

export const PROVIDER_PRESETS: readonly ProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1-mini'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat'
  },
  {
    id: 'zhipu',
    name: '智谱',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash'
  },
  {
    id: 'dashscope',
    name: '通义',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-turbo'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4.1-mini'
  },
  {
    id: 'ollama',
    name: 'Ollama',
    baseUrl: 'http://127.0.0.1:11434/v1',
    defaultModel: 'qwen2.5:3b',
    hint: '本地运行，无需 Key'
  }
] as const

export function findProviderByBaseUrl(baseUrl: string): ProviderPreset | undefined {
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized) {
    return undefined
  }
  return PROVIDER_PRESETS.find((preset) => normalizeBaseUrl(preset.baseUrl) === normalized)
}

export function findProviderById(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((preset) => preset.id === id)
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '').toLowerCase()
}
