import type { ReactElement } from 'react'
import { Copy, ExternalLink, Pause, RefreshCw, Settings, Square, Volume2, Check } from 'lucide-react'

import type { TranslationState } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type CopyStatus = 'idle' | 'translated' | 'source' | 'error'

interface TranslationResultProps {
  translation: TranslationState
  isLoading: boolean
  shortcutLabel: string
  canRetry: boolean
  canPlayTranslated: boolean
  isSpeaking: 'source' | 'translated' | null
  copyStatus: CopyStatus
  errorActions: readonly string[]
  onOpenSettings: () => void
  onRetry: () => void | Promise<void>
  onOpenAccessibilitySettings: () => void | Promise<void>
  onCancelTranslation: () => void | Promise<void>
  onTogglePlayback: (target: 'translated') => void
  onCopyTranslated: () => void | Promise<void>
}

export function TranslationResult({
  translation,
  isLoading,
  shortcutLabel,
  canRetry,
  canPlayTranslated,
  isSpeaking,
  copyStatus,
  errorActions,
  onOpenSettings,
  onRetry,
  onOpenAccessibilitySettings,
  onCancelTranslation,
  onTogglePlayback,
  onCopyTranslated
}: TranslationResultProps): ReactElement {
  const content = renderContent({
    translation,
    isLoading,
    shortcutLabel,
    canRetry,
    errorActions,
    onOpenSettings,
    onRetry,
    onOpenAccessibilitySettings
  })

  return (
    <Card className="relative flex-1 min-h-0 overflow-hidden bg-card shadow-none">
      <ScrollArea className="h-full">
        <div className="px-4 py-4 pr-12 pb-12 select-text">{content}</div>
      </ScrollArea>
      {isLoading && (
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="absolute left-2 top-2 h-7 w-7 bg-background/90 shadow-sm"
          onClick={() => void onCancelTranslation()}
          aria-label="取消翻译"
          title="取消"
        >
          <Square className="h-3 w-3" />
        </Button>
      )}
      <div className="absolute bottom-2 right-2 flex items-center gap-1">
        {canRetry && (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-8 w-8 bg-background/90 shadow-sm"
            onClick={() => void onRetry()}
            aria-label="重新翻译"
            title="重试"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
        {canPlayTranslated && (
          <Button
            type="button"
            variant={isSpeaking === 'translated' ? 'default' : 'secondary'}
            size="icon"
            className={cn('h-8 w-8 shadow-sm', isSpeaking !== 'translated' && 'bg-background/90')}
            onClick={() => onTogglePlayback('translated')}
            aria-label={isSpeaking === 'translated' ? '停止播放译文' : '播放译文'}
            title={isSpeaking === 'translated' ? '停止' : '播放译文'}
          >
            {isSpeaking === 'translated' ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
        )}
        {translation.status === 'success' && translation.translatedText && (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-8 w-8 bg-background/90 shadow-sm"
            onClick={() => void onCopyTranslated()}
            aria-label={copyStatus === 'translated' ? '已复制译文' : '复制译文'}
            title={
              copyStatus === 'translated'
                ? '已复制译文'
                : copyStatus === 'error'
                  ? '复制失败'
                  : '复制译文'
            }
          >
            {copyStatus === 'translated' ? (
              <Check className="h-4 w-4 text-primary" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
    </Card>
  )
}

interface RenderContentInput {
  translation: TranslationState
  isLoading: boolean
  shortcutLabel: string
  canRetry: boolean
  errorActions: readonly string[]
  onOpenSettings: () => void
  onRetry: () => void | Promise<void>
  onOpenAccessibilitySettings: () => void | Promise<void>
}

function renderContent({
  translation,
  isLoading,
  shortcutLabel,
  canRetry,
  errorActions,
  onOpenSettings,
  onRetry,
  onOpenAccessibilitySettings
}: RenderContentInput): ReactElement {
  const phoneticBlock = translation.phonetic ? (
    <p className="mb-1.5 font-mono text-sm text-muted-foreground select-text">
      {translation.phonetic}
    </p>
  ) : null

  if (translation.status === 'success' && translation.translatedText) {
    return (
      <div key={translation.translatedText} className="space-y-2">
        {phoneticBlock}
        <p className="text-[17px] leading-7 text-foreground whitespace-pre-wrap">
          {translation.translatedText}
        </p>
      </div>
    )
  }

  if (translation.status === 'error') {
    return (
      <div className="space-y-2.5">
        <p className="text-sm leading-relaxed text-destructive">
          {translation.errorMessage || '出错了'}
        </p>
        {errorActions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {errorActions.includes('open-settings') && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={onOpenSettings}
              >
                <Settings className="h-3.5 w-3.5" />
                打开设置
              </Button>
            )}
            {errorActions.includes('retry') && canRetry && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => void onRetry()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                重试
              </Button>
            )}
            {errorActions.includes('open-accessibility') && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => void onOpenAccessibilitySettings()}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                辅助功能
              </Button>
            )}
          </div>
        )}
      </div>
    )
  }

  if (isLoading) {
    if (translation.translatedText) {
      return (
        <div className="space-y-2">
          {phoneticBlock}
          <p className="text-[17px] leading-7 text-muted-foreground whitespace-pre-wrap">
            {translation.translatedText}
          </p>
        </div>
      )
    }
    if (translation.errorMessage) {
      return (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {translation.errorMessage}
        </p>
      )
    }
    return (
      <div className="flex flex-col gap-2.5">
        {phoneticBlock}
        <Skeleton className="h-3.5 w-[92%]" />
        <Skeleton className="h-3.5 w-[76%]" />
        <Skeleton className="h-3.5 w-[54%]" />
      </div>
    )
  }

  if (translation.status === 'cancelled') {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        {translation.errorMessage || '已取消'}
      </p>
    )
  }

  if (translation.status === 'empty') {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        {translation.errorMessage || '没有获取到选中文本'}
      </p>
    )
  }

  return (
    <div className="flex h-full w-full items-center justify-center">
      <kbd className="inline-flex items-center rounded border bg-background px-2 py-1 font-mono text-xs text-muted-foreground shadow-sm">
        {shortcutLabel}
      </kbd>
    </div>
  )
}
