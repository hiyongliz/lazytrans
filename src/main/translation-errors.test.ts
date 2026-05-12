import { describe, expect, it } from 'vitest'

import { toUserFacingTranslationError } from './translation-errors'

describe('translation error formatting', () => {
  it('turns a missing api key error into a settings action', () => {
    expect(
      toUserFacingTranslationError(
        new Error('OPENAI_API_KEY or TRANSLATE_API_KEY is not configured')
      )
    ).toEqual({
      code: 'missing-api-key',
      message: '还没有配置 API Key。打开设置填入 Key 后再翻译。'
    })
  })

  it('turns macOS automation failures into an accessibility action', () => {
    expect(
      toUserFacingTranslationError(
        new Error('osascript 执行失败: System Events got an error: Not authorized')
      )
    ).toEqual({
      code: 'selection-permission',
      message: 'macOS 没有授权 LazyTrans 读取选中文本。请在辅助功能里允许当前终端或 LazyTrans。'
    })
  })

  it('turns timeout failures into retryable Chinese copy', () => {
    expect(toUserFacingTranslationError(new Error('API request timed out after 15000ms'))).toEqual({
      code: 'api-timeout',
      message: '请求超时，网络或模型响应偏慢。可以重试，或换一个更快的模型。'
    })
  })
})
