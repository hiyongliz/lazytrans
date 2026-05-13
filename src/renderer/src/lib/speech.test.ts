import { describe, expect, it, vi } from 'vitest'

import {
  cancelSpeech,
  detectSpeechLang,
  speak,
  type SpeechRunner
} from './speech'

describe('detectSpeechLang', () => {
  it('identifies Chinese text by the presence of CJK ideographs', () => {
    expect(detectSpeechLang('你好')).toBe('zh-CN')
    expect(detectSpeechLang('Hello 世界')).toBe('zh-CN')
  })

  it('falls back to en-US for non-CJK text', () => {
    expect(detectSpeechLang('Hello')).toBe('en-US')
    expect(detectSpeechLang("don't")).toBe('en-US')
    expect(detectSpeechLang('123 abc')).toBe('en-US')
  })
})

describe('speak', () => {
  function makeRunner(): SpeechRunner & {
    speakMock: ReturnType<typeof vi.fn>
    cancelMock: ReturnType<typeof vi.fn>
  } {
    const speakMock = vi.fn()
    const cancelMock = vi.fn()
    return {
      speakMock,
      cancelMock,
      speak: speakMock,
      cancel: cancelMock
    }
  }

  function fakeUtterance(text: string): SpeechSynthesisUtterance {
    return {
      text,
      lang: '',
      rate: 1,
      pitch: 1,
      volume: 1,
      voice: null,
      onstart: null,
      onend: null,
      onerror: null,
      onmark: null,
      onpause: null,
      onresume: null,
      onboundary: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    } as unknown as SpeechSynthesisUtterance
  }

  it('returns false for empty input and does not call the runner', () => {
    const runner = makeRunner()
    expect(
      speak('   ', {
        runner,
        utteranceFactory: fakeUtterance
      })
    ).toBe(false)
    expect(runner.speakMock).not.toHaveBeenCalled()
  })

  it('cancels any in-flight utterance before starting a new one', () => {
    const runner = makeRunner()
    speak('hello', {
      runner,
      utteranceFactory: fakeUtterance
    })
    expect(runner.cancelMock).toHaveBeenCalled()
    expect(runner.speakMock).toHaveBeenCalledTimes(1)
  })

  it('assigns Chinese language tag for CJK input', () => {
    const runner = makeRunner()
    let captured: SpeechSynthesisUtterance | undefined
    runner.speakMock.mockImplementation((u: SpeechSynthesisUtterance) => {
      captured = u
    })

    speak('你好世界', {
      runner,
      utteranceFactory: fakeUtterance
    })

    expect(captured?.lang).toBe('zh-CN')
  })

  it('forwards onStart/onEnd lifecycle hooks via the utterance event handlers', () => {
    const runner = makeRunner()
    const onStart = vi.fn()
    const onEnd = vi.fn()
    let captured: SpeechSynthesisUtterance | undefined
    runner.speakMock.mockImplementation((u: SpeechSynthesisUtterance) => {
      captured = u
    })

    speak('hello', {
      runner,
      utteranceFactory: fakeUtterance,
      onStart,
      onEnd
    })

    captured?.onstart?.(undefined as never)
    captured?.onend?.(undefined as never)

    expect(onStart).toHaveBeenCalled()
    expect(onEnd).toHaveBeenCalled()
  })

  it('returns false when no SpeechSynthesis runner is available', () => {
    expect(
      speak('hello', {
        runner: null as unknown as SpeechRunner,
        utteranceFactory: fakeUtterance
      })
    ).toBe(false)
  })
})

describe('cancelSpeech', () => {
  it('calls cancel on the provided runner', () => {
    const cancel = vi.fn()
    cancelSpeech({ speak: vi.fn(), cancel })
    expect(cancel).toHaveBeenCalled()
  })

  it('is a no-op when no runner is provided in non-browser environments', () => {
    expect(() => cancelSpeech(null)).not.toThrow()
  })
})
