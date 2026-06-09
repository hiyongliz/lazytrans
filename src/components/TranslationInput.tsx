import type { KeyboardEvent as ReactKeyboardEvent, RefObject, ReactElement } from 'react'
import { ArrowRightLeft, Check, Clipboard, Eraser, Loader2, Pause, Volume2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type CopyStatus = 'idle' | 'translated' | 'source' | 'error'

interface TranslationInputProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  manualText: string
  canSubmit: boolean
  isLoading: boolean
  canPlaySource: boolean
  canCopySource: boolean
  copyStatus: CopyStatus
  isSpeaking: 'source' | 'translated' | null
  onChange: (value: string) => void
  onKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void
  onTogglePlayback: (target: 'source') => void
  onCopySource: () => void | Promise<void>
  onClear: () => void
  onSubmit: () => void | Promise<void>
}

export function TranslationInput({
  textareaRef,
  manualText,
  canSubmit,
  isLoading,
  canPlaySource,
  canCopySource,
  copyStatus,
  isSpeaking,
  onChange,
  onKeyDown,
  onTogglePlayback,
  onCopySource,
  onClear,
  onSubmit
}: TranslationInputProps): ReactElement {
  return (
    <div className="relative shrink-0">
      <Textarea
        ref={textareaRef}
        data-manual-input="true"
        value={manualText}
        placeholder="键入或选中…"
        className="min-h-[88px] resize-none border-border/70 bg-background/80 pr-40 shadow-none"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="absolute bottom-2 right-2 flex items-center gap-1">
        {canPlaySource && (
          <Button
            type="button"
            variant={isSpeaking === 'source' ? 'default' : 'secondary'}
            size="icon"
            className={cn('h-8 w-8 shadow-sm', isSpeaking !== 'source' && 'bg-background/90')}
            onClick={() => onTogglePlayback('source')}
            aria-label={isSpeaking === 'source' ? '停止播放原文' : '播放原文'}
            title={isSpeaking === 'source' ? '停止' : '播放原文'}
          >
            {isSpeaking === 'source' ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
        )}
        {canCopySource && (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-8 w-8 bg-background/90 shadow-sm"
            onClick={() => void onCopySource()}
            aria-label={copyStatus === 'source' ? '已复制原文' : '复制原文'}
            title={copyStatus === 'source' ? '已复制原文' : '复制原文'}
          >
            {copyStatus === 'source' ? (
              <Check className="h-4 w-4 text-primary" />
            ) : (
              <Clipboard className="h-4 w-4" />
            )}
          </Button>
        )}
        {manualText && (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-8 w-8 bg-background/90 shadow-sm"
            onClick={onClear}
            aria-label="清空输入"
            title="清空"
          >
            <Eraser className="h-4 w-4" />
          </Button>
        )}
        <Button
          type="button"
          variant="default"
          size="icon"
          className="h-8 w-8 shadow-sm"
          onClick={() => void onSubmit()}
          disabled={!canSubmit}
          aria-label="翻译"
          title="翻译"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRightLeft className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  )
}
