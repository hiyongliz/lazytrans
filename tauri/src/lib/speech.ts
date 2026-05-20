export type SpeechLang = 'zh-CN' | 'en-US'

export interface SpeechRunner {
  speak(utterance: SpeechSynthesisUtterance): void
  cancel(): void
}

const CJK_PATTERN = /[㐀-鿿]/

export function detectSpeechLang(text: string): SpeechLang {
  return CJK_PATTERN.test(text) ? 'zh-CN' : 'en-US'
}

export interface SpeakOptions {
  rate?: number
  pitch?: number
  onStart?: () => void
  onEnd?: () => void
  onError?: (error: SpeechSynthesisErrorEvent) => void
  runner?: SpeechRunner
  utteranceFactory?: (text: string) => SpeechSynthesisUtterance
}

export function speak(text: string, options: SpeakOptions = {}): boolean {
  const trimmed = text.trim()
  if (!trimmed) {
    return false
  }

  const runner = options.runner ?? defaultRunner()
  if (!runner) {
    return false
  }

  const factory =
    options.utteranceFactory ??
    ((value: string) => new SpeechSynthesisUtterance(value))
  const utterance = factory(trimmed)
  utterance.lang = detectSpeechLang(trimmed)
  if (options.rate !== undefined) utterance.rate = options.rate
  if (options.pitch !== undefined) utterance.pitch = options.pitch
  utterance.onstart = (): void => options.onStart?.()
  utterance.onend = (): void => options.onEnd?.()
  utterance.onerror = (event): void => options.onError?.(event)

  runner.cancel()
  runner.speak(utterance)
  return true
}

export function cancelSpeech(runner: SpeechRunner | null = defaultRunner()): void {
  runner?.cancel()
}

function defaultRunner(): SpeechRunner | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return null
  }
  return {
    speak: (utterance) => window.speechSynthesis.speak(utterance),
    cancel: () => window.speechSynthesis.cancel()
  }
}
