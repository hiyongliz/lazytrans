export type TranslationErrorCode =
  | 'missing-api-key'
  | 'auth-failed'
  | 'rate-limited'
  | 'api-timeout'
  | 'selection-permission'
  | 'network'
  | 'api-error'

export interface UserFacingTranslationError {
  code: TranslationErrorCode
  message: string
}

export function toUserFacingTranslationError(error: unknown): UserFacingTranslationError {
  const message = formatErrorMessage(error)
  const normalized = message.toLowerCase()

  if (
    normalized.includes('openai_api_key') ||
    normalized.includes('translate_api_key') ||
    normalized.includes('api key is not configured')
  ) {
    return {
      code: 'missing-api-key',
      message: '还没有配置 API Key。打开设置填入 Key 后再翻译。'
    }
  }

  if (
    normalized.includes('not authorized') ||
    normalized.includes('not authorised') ||
    normalized.includes('辅助功能') ||
    normalized.includes('osascript 执行失败') ||
    normalized.includes('system events got an error')
  ) {
    return {
      code: 'selection-permission',
      message: 'macOS 没有授权 LazyTrans 读取选中文本。请在辅助功能里允许当前终端或 LazyTrans。'
    }
  }

  if (normalized.includes('timed out') || normalized.includes('timeout')) {
    return {
      code: 'api-timeout',
      message: '请求超时，网络或模型响应偏慢。可以重试，或换一个更快的模型。'
    }
  }

  if (
    normalized.includes('401') ||
    normalized.includes('unauthorized') ||
    normalized.includes('incorrect api key') ||
    normalized.includes('invalid api key')
  ) {
    return {
      code: 'auth-failed',
      message: 'API Key 无法通过验证。请检查 Key、Base URL 和模型配置。'
    }
  }

  if (
    normalized.includes('429') ||
    normalized.includes('rate limit') ||
    normalized.includes('quota')
  ) {
    return {
      code: 'rate-limited',
      message: '接口暂时限流或额度不足。稍后重试，或切换可用的 Key。'
    }
  }

  if (normalized.includes('failed to fetch') || normalized.includes('network')) {
    return {
      code: 'network',
      message: '网络请求失败。请检查网络、代理或 Base URL。'
    }
  }

  return {
    code: 'api-error',
    message: message || '翻译失败，请稍后重试。'
  }
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
